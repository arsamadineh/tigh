import type { RateLimitConfig, RateLimitResult, Request, TighRequest } from './types';
import { TighGcraRateLimiter } from './rate-limiter/gcra';

export { TighGcraRateLimiter };

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface SlidingWindow {
  timestamps: number[];
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
  strategy: 'token-bucket',
};

/**
 * TighRateLimiter: Multi-strategy rate limiter.
 * Supports token-bucket, sliding-window, fixed-window, and GCRA.
 */
export class TighRateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, TokenBucket> = new Map();
  private windows: Map<string, SlidingWindow> = new Map();
  private gcraLimiter?: TighGcraRateLimiter;
  private stats = {
    totalRequests: 0,
    rejected: 0,
    byKey: new Map<string, { allowed: number; rejected: number }>(),
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.strategy === 'gcra') {
      this.gcraLimiter = new TighGcraRateLimiter(this.config);
    }
    if (this.config.windowMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.windowMs * 2);
    }
  }

  private getKey(req: Request | TighRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req as TighRequest);
    }
    const xff = req.headers['x-forwarded-for'];
    const clientIp = xff ? xff.split(',')[0]?.trim() : undefined;
    return (
      clientIp ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      req.ip ||
      'anonymous'
    );
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private checkTokenBucket(key: string): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.maxRequests, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    }

    this.refillBucket(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: bucket.lastRefill + this.config.windowMs,
        limit: this.config.maxRequests,
      };
    }

    const retryAfter = Math.ceil(
      (1 - bucket.tokens) / (this.config.maxRequests / this.config.windowMs) / 1000
    );
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.lastRefill + this.config.windowMs,
      limit: this.config.maxRequests,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  private checkSlidingWindow(key: string): RateLimitResult {
    let window = this.windows.get(key);
    if (!window) {
      window = { timestamps: [] };
      this.windows.set(key, window);
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    window.timestamps = window.timestamps.filter((ts) => ts > windowStart);

    if (window.timestamps.length < this.config.maxRequests) {
      window.timestamps.push(now);
      return {
        allowed: true,
        remaining: this.config.maxRequests - window.timestamps.length,
        resetAt: (window.timestamps[0] || now) + this.config.windowMs,
        limit: this.config.maxRequests,
      };
    }

    const oldestInWindow = window.timestamps[0] || now;
    const retryAfter = Math.ceil((oldestInWindow + this.config.windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + this.config.windowMs,
      limit: this.config.maxRequests,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  check(req: Request | TighRequest): RateLimitResult {
    if (this.gcraLimiter) {
      return this.gcraLimiter.check(req as TighRequest);
    }

    this.stats.totalRequests++;
    const key = this.getKey(req);

    let result: RateLimitResult;
    switch (this.config.strategy) {
      case 'sliding-window':
        result = this.checkSlidingWindow(key);
        break;
      case 'fixed-window':
      case 'token-bucket':
      default:
        result = this.checkTokenBucket(key);
        break;
    }

    const keyStats = this.stats.byKey.get(key) ?? { allowed: 0, rejected: 0 };
    if (result.allowed) {
      keyStats.allowed++;
    } else {
      keyStats.rejected++;
      this.stats.rejected++;
    }
    this.stats.byKey.set(key, keyStats);

    return result;
  }

  headers(result: RateLimitResult): Record<string, string> {
    if (this.gcraLimiter) {
      return this.gcraLimiter.headers(result);
    }
    const windowSec = Math.ceil((this.config.windowMs || 60000) / 1000);
    const retryAfter = result.retryAfter ?? Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return {
      'RateLimit': `limit=${result.limit}; remaining=${result.remaining}; reset=${Math.floor(
        result.resetAt / 1000
      )}`,
      'RateLimit-Policy': `${result.limit};w=${windowSec}`,
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
    };
  }

  getStats() {
    if (this.gcraLimiter) {
      return this.gcraLimiter.getStats();
    }
    const byKey: Record<string, { allowed: number; rejected: number }> = {};
    for (const [k, v] of this.stats.byKey) {
      byKey[k] = { ...v };
    }
    return {
      totalRequests: this.stats.totalRequests,
      rejected: this.stats.rejected,
      byKey,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > this.config.windowMs * 2) {
        this.buckets.delete(key);
      }
    }
    for (const [key, window] of this.windows) {
      if (window.timestamps.length === 0 || now - window.timestamps[window.timestamps.length - 1]! > this.config.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.gcraLimiter) {
      this.gcraLimiter.destroy();
    }
    this.buckets.clear();
    this.windows.clear();
  }
}
