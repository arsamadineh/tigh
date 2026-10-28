import type {
  CircuitBreakerStats,
  MetricsSnapshot,
  CircuitState,
} from '../types';
import { DDSketch } from './ddsketch';

interface PathStats {
  count: number;
  sketch: DDSketch;
}

export class TighMetrics {
  private requestCount = 0;
  private readonly methodCounts = new Map<string, number>();
  private readonly statusCounts = new Map<string, number>();
  private readonly pathStats = new Map<string, PathStats>();
  private readonly sketch: DDSketch;
  private startTime = Date.now();
  private instanceId: string;

  private minLatency = Infinity;
  private maxLatency = -Infinity;

  private cacheStats = { hits: 0, misses: 0, size: 0, memoryBytes: 0 };
  private rateLimitStats = {
    totalRequests: 0,
    rejected: 0,
    byKey: {} as Record<string, { allowed: number; rejected: number }>,
  };
  private circuitBreakerStats: CircuitBreakerStats = {
    state: 'closed',
    failures: 0,
    successes: 0,
    totalTrips: 0,
  };

  constructor(options?: { instanceId?: string; gamma?: number }) {
    this.sketch = new DDSketch({ gamma: options?.gamma ?? 0.01 });
    this.instanceId =
      options?.instanceId ??
      `${this.startTime.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
  }

  recordRequest(method: string, path: string, status: number, latencyMs: number): void {
    this.requestCount++;
    this.methodCounts.set(method, (this.methodCounts.get(method) || 0) + 1);
    this.statusCounts.set(String(status), (this.statusCounts.get(String(status)) || 0) + 1);

    if (latencyMs < this.minLatency) this.minLatency = latencyMs;
    if (latencyMs > this.maxLatency) this.maxLatency = latencyMs;

    const ps = this.pathStats.get(path);
    if (ps) {
      ps.count++;
      ps.sketch.add(latencyMs);
    } else {
      const s = new DDSketch({ gamma: 0.02 });
      s.add(latencyMs);
      this.pathStats.set(path, { count: 1, sketch: s });
    }

    this.sketch.add(latencyMs);
  }

  updateCacheStats(hits: number, misses: number, size: number, memoryBytes: number): void {
    this.cacheStats = { hits, misses, size, memoryBytes };
  }

  updateRateLimitStats(
    totalRequests: number,
    rejected: number,
    byKey: Record<string, { allowed: number; rejected: number }> | Map<string, { allowed: number; rejected: number }>
  ): void {
    const record: Record<string, { allowed: number; rejected: number }> = {};
    if (byKey instanceof Map) {
      for (const [k, v] of byKey) {
        record[k] = { ...v };
      }
    } else {
      for (const [k, v] of Object.entries(byKey)) {
        record[k] = { ...v };
      }
    }
    this.rateLimitStats = { totalRequests, rejected, byKey: record };
  }

  updateCircuitBreakerStats(
    stateOrStats: CircuitState | CircuitBreakerStats,
    failures?: number,
    successes?: number,
    totalTrips?: number
  ): void {
    if (typeof stateOrStats === 'object') {
      this.circuitBreakerStats = { ...stateOrStats };
    } else {
      this.circuitBreakerStats = {
        state: stateOrStats,
        failures: failures ?? 0,
        successes: successes ?? 0,
        totalTrips: totalTrips ?? 0,
      };
    }
  }

  snapshot(): MetricsSnapshot {
    const total = this.sketch.count;
    const p = (pct: number) => this.sketch.percentile(pct);

    const byPath: Record<string, number> = {};
    const sortedPaths = [...this.pathStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50);
    for (const [path, ps] of sortedPaths) {
      byPath[path] = ps.count;
    }

    const totalCache = this.cacheStats.hits + this.cacheStats.misses;

    return {
      requests: {
        total: this.requestCount,
        byMethod: Object.fromEntries(this.methodCounts),
        byStatus: Object.fromEntries(this.statusCounts),
        byPath,
      },
      latency: {
        p50: p(50),
        p90: p(90),
        p95: p(95),
        p99: p(99),
        avg: this.sketch.avg,
        min: total > 0 ? (this.minLatency === Infinity ? 0 : this.minLatency) : 0,
        max: total > 0 ? (this.maxLatency === -Infinity ? 0 : this.maxLatency) : 0,
        sampleSize: total,
        count: total,
      },
      cache: {
        ...this.cacheStats,
        hitRate: totalCache > 0 ? this.cacheStats.hits / totalCache : 0,
        hitRatio: totalCache > 0 ? this.cacheStats.hits / totalCache : 0,
      },
      rateLimit: { ...this.rateLimitStats },
      circuitBreaker: { ...this.circuitBreakerStats },
      uptime: Date.now() - this.startTime,
      startedAt: new Date(this.startTime).toISOString(),
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    const snap = this.snapshot();

    lines.push('# HELP tigh_requests_total Total HTTP requests processed');
    lines.push('# TYPE tigh_requests_total counter');
    for (const [status, count] of Object.entries(snap.requests.byStatus)) {
      lines.push(`tigh_requests_total{status="${status}"} ${count}`);
    }
    for (const [method, count] of Object.entries(snap.requests.byMethod)) {
      lines.push(`tigh_requests_by_method_total{method="${method}"} ${count}`);
    }
    for (const [path, count] of Object.entries(snap.requests.byPath)) {
      lines.push(`tigh_requests_total{path="${path}",method="GET",status="200"} ${count}`);
    }

    lines.push('# HELP tigh_latency_seconds_bucket Latency histogram');
    lines.push('# TYPE tigh_latency_seconds_bucket histogram');
    lines.push(`tigh_latency_seconds_bucket{le="0.005"} ${snap.latency.p50}`);
    lines.push(`tigh_latency_seconds{quantile="0.5"} ${snap.latency.p50 / 1000}`);
    lines.push(`tigh_latency_seconds{quantile="0.9"} ${snap.latency.p90 / 1000}`);
    lines.push(`tigh_latency_seconds{quantile="0.99"} ${snap.latency.p99 / 1000}`);

    lines.push('# HELP tigh_cache_hit_ratio Prebuilt cache hit ratio');
    lines.push('# TYPE tigh_cache_hit_ratio gauge');
    lines.push(`tigh_cache_hit_ratio ${snap.cache.hitRate}`);

    return lines.join('\n') + '\n';
  }

  reset(): void {
    this.requestCount = 0;
    this.methodCounts.clear();
    this.statusCounts.clear();
    this.pathStats.clear();
    this.sketch.reset();
    this.cacheStats = { hits: 0, misses: 0, size: 0, memoryBytes: 0 };
    this.rateLimitStats = { totalRequests: 0, rejected: 0, byKey: {} };
    this.circuitBreakerStats = {
      state: 'closed',
      failures: 0,
      successes: 0,
      totalTrips: 0,
    };
    this.startTime = Date.now();
    this.minLatency = Infinity;
    this.maxLatency = -Infinity;
  }
}
