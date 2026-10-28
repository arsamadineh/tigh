import type { CacheConfig } from '../types';

/**
 * Frequency-bounded ghost ledger used by the W-TinyLFU admission filter.
 * Evicted keys retain their access frequency for a bounded period so that
 * repeat-access items can be re-admitted when seen again.
 */
export class GhostLedger {
  private map: Map<string, number> = new Map();
  private order: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  get(key: string): number | undefined {
    return this.map.get(key);
  }

  set(key: string, freq: number): void {
    if (this.map.has(key)) {
      this.map.set(key, freq);
      return;
    }
    if (this.order.length >= this.maxSize) {
      const evict = this.order.shift();
      if (evict !== undefined) {
        this.map.delete(evict);
      }
    }
    this.map.set(key, freq);
    this.order.push(key);
  }

  delete(key: string): void {
    if (this.map.delete(key)) {
      const idx = this.order.indexOf(key);
      if (idx >= 0) this.order.splice(idx, 1);
    }
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
    this.order = [];
  }
}

export interface CacheItem {
  value: Uint8Array;
  expiresAt: number;
  size: number;
  freq: number;
}

/**
 * Prebuilt response cache with S3-FIFO queues and W-TinyLFU admission filter.
 *
 * Stores pre-serialized Uint8Array fragments so the hot-path never calls
 * JSON.stringify or JSON.parse.
 *
 * S3-FIFO uses three FIFO queues:
 * - `inQueue` (25% capacity): landing queue for newly admitted items.
 * - `probation` (25% capacity): second chance for items evicted from inQueue.
 * - `main` (50% capacity): long-term high-frequency items.
 *
 * W-TinyLFU uses the GhostLedger to make smart admission decisions on
 * eviction pressure, preventing cache pollution from one-time scans.
 */
export class PrebuiltCache {
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private readonly inMax: number;
  private readonly probationMax: number;
  private readonly mainMax: number;

  // S3-FIFO queues (insertion-ordered Maps)
  private readonly inQueue: Map<string, CacheItem> = new Map();
  private readonly probation: Map<string, CacheItem> = new Map();
  private readonly main: Map<string, CacheItem> = new Map();

  private ghost: GhostLedger;
  private readonly freq = new Map<string, number>();

  private stats = { hits: 0, misses: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    const cfg: CacheConfig = {
      maxSize: 2000,
      defaultTTL: 60000,
      checkInterval: 30000,
      ...config,
    };
    this.maxSize = Math.max(4, cfg.maxSize);
    this.defaultTTL = cfg.defaultTTL;
    this.ghost = new GhostLedger(Math.min(2000, this.maxSize));

    // Queue ratios: in 25%, probation 25%, main 50%
    this.inMax = Math.max(1, Math.floor(this.maxSize * 0.25));
    this.probationMax = Math.max(1, Math.floor(this.maxSize * 0.25));
    this.mainMax = Math.max(1, this.maxSize - this.inMax - this.probationMax);

    if (cfg.checkInterval > 0) {
      this.cleanupTimer = setInterval(() => this.evictExpired(), cfg.checkInterval);
    }
  }

  /**
   * Retrieves a pre-serialized fragment or null on miss. Zero parsing overhead.
   */
  get(key: string): Uint8Array | null {
    const now = Date.now();

    // 1. Check main queue
    let item = this.main.get(key);
    if (item) {
      if (item.expiresAt <= now) {
        this.main.delete(key);
        this.freq.delete(key);
      } else {
        this.stats.hits++;
        this.freq.set(key, (this.freq.get(key) || 0) + 1);
        return item.value;
      }
    }

    // 2. Check probation queue (promote to main on hit)
    item = this.probation.get(key);
    if (item) {
      if (item.expiresAt <= now) {
        this.probation.delete(key);
        this.freq.delete(key);
      } else {
        this.stats.hits++;
        this.freq.set(key, (this.freq.get(key) || 0) + 1);
        this.promoteToMain(key, item);
        return item.value;
      }
    }

    // 3. Check inQueue
    item = this.inQueue.get(key);
    if (item) {
      if (item.expiresAt <= now) {
        this.inQueue.delete(key);
        this.freq.delete(key);
      } else {
        this.stats.hits++;
        this.freq.set(key, (this.freq.get(key) || 0) + 1);
        return item.value;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Stores a pre-serialized fragment into the cache.
   */
  set(key: string, value: Uint8Array, ttl?: number): void {
    const now = Date.now();
    const effectiveTTL = ttl ?? this.defaultTTL;
    const size = value.byteLength;
    const expiresAt = now + effectiveTTL;

    // Refresh if already present in main
    let item = this.main.get(key);
    if (item) {
      item.value = value;
      item.expiresAt = expiresAt;
      item.size = size;
      this.freq.set(key, (this.freq.get(key) || 0) + 1);
      return;
    }

    // Refresh and promote if in probation
    item = this.probation.get(key);
    if (item) {
      this.promoteToMain(key, {
        value,
        expiresAt,
        size,
        freq: (this.freq.get(key) || 0) + 1,
      });
      return;
    }

    // Refresh if in inQueue
    item = this.inQueue.get(key);
    if (item) {
      item.value = value;
      item.expiresAt = expiresAt;
      item.size = size;
      this.freq.set(key, (this.freq.get(key) || 0) + 1);
      return;
    }

    // New entry
    const ghostFreq = this.ghost.get(key) ?? 0;
    const entry: CacheItem = {
      value,
      expiresAt,
      size,
      freq: Math.max(1, ghostFreq + 1),
    };

    this.admit(key, entry);
  }

  private admit(key: string, entry: CacheItem): void {
    // If inQueue is full, evict oldest to probation or filter
    if (this.inQueue.size >= this.inMax) {
      const nextEntry = this.inQueue.entries().next().value;
      if (nextEntry) {
        const [victimKey, victim] = nextEntry as [string, CacheItem];
        this.inQueue.delete(victimKey);
        this.ghost.set(victimKey, victim.freq);
        this.freq.delete(victimKey);

        if (this.probation.size >= this.probationMax) {
          // Probation full: TinyLFU admission filter
          const nextProbEntry = this.probation.entries().next().value;
          if (nextProbEntry) {
            const [probVictimKey, probVictim] = nextProbEntry as [string, CacheItem];
            this.probation.delete(probVictimKey);
            this.ghost.set(probVictimKey, probVictim.freq);
            this.freq.delete(probVictimKey);

            const candidateFreq = entry.freq;
            const victimFreq = this.ghost.get(probVictimKey) ?? probVictim.freq;

            if (candidateFreq >= victimFreq) {
              if (this.main.size >= this.mainMax) {
                const nextMainEntry = this.main.entries().next().value;
                if (nextMainEntry) {
                  const [mainVictimKey, mainVictim] = nextMainEntry as [string, CacheItem];
                  this.main.delete(mainVictimKey);
                  this.ghost.set(mainVictimKey, mainVictim.freq);
                  this.freq.delete(mainVictimKey);
                }
              }
              this.main.set(key, entry);
              this.freq.set(key, entry.freq);
              return;
            }
          }
        } else {
          this.probation.set(victimKey, victim);
        }
      }
    }

    this.inQueue.set(key, entry);
    this.freq.set(key, entry.freq);
  }

  private promoteToMain(key: string, item: CacheItem): void {
    this.probation.delete(key);
    if (this.main.size >= this.mainMax) {
      const nextMainEntry = this.main.entries().next().value;
      if (nextMainEntry) {
        const [mainVictimKey, mainVictim] = nextMainEntry as [string, CacheItem];
        this.main.delete(mainVictimKey);
        this.ghost.set(mainVictimKey, mainVictim.freq);
        this.freq.delete(mainVictimKey);
      }
    }
    this.main.set(key, item);
    this.freq.set(key, item.freq);
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const deleted =
      this.main.delete(key) ||
      this.probation.delete(key) ||
      this.inQueue.delete(key);
    this.freq.delete(key);
    this.ghost.delete(key);
    return deleted;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const map of [this.main, this.probation, this.inQueue]) {
      for (const [key, item] of map) {
        if (item.expiresAt <= now) {
          map.delete(key);
          this.freq.delete(key);
          this.ghost.set(key, item.freq);
        }
      }
    }
  }

  clear(): void {
    this.main.clear();
    this.probation.clear();
    this.inQueue.clear();
    this.freq.clear();
    this.ghost.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  size(): number {
    return this.main.size + this.probation.size + this.inQueue.size;
  }

  memoryBytes(): number {
    let total = 0;
    for (const item of this.main.values()) total += item.size;
    for (const item of this.probation.values()) total += item.size;
    for (const item of this.inQueue.values()) total += item.size;
    return total;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.size(),
      memoryBytes: this.memoryBytes(),
    };
  }

  invalidatePattern(pattern: string): number {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let count = 0;
    for (const map of [this.main, this.probation, this.inQueue]) {
      for (const key of [...map.keys()]) {
        if (regex.test(key)) {
          map.delete(key);
          this.freq.delete(key);
          count++;
        }
      }
    }
    return count;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  // Convenience helper for JSON serialization
  getJson<T = unknown>(key: string): T | null {
    const bytes = this.get(key);
    if (!bytes) return null;
    try {
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  setJson<T = unknown>(key: string, value: T, ttl?: number): void {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const bytes = new TextEncoder().encode(text);
    this.set(key, bytes, ttl);
  }
}

const inflightMap = new WeakMap<object, Map<string, Promise<Uint8Array>>>();

/**
 * Executes a factory function with single-flight request coalescing.
 * Concurrent callers requesting the same key share a single in-flight promise,
 * preventing cache stampedes.
 */
export async function withSingleFlight(
  cache: PrebuiltCache,
  key: string,
  factory: () => Promise<Uint8Array>,
  ttl?: number
): Promise<Uint8Array> {
  const cached = cache.get(key);
  if (cached) return cached;

  let inflight = inflightMap.get(cache);
  if (!inflight) {
    inflight = new Map<string, Promise<Uint8Array>>();
    inflightMap.set(cache, inflight);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const value = await factory();
      cache.set(key, value, ttl);
      return value;
    } finally {
      inflight?.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
