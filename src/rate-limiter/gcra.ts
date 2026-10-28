import type { RateLimitConfig, RateLimitResult, TighRequest } from '../types';

/**
 * Generic Cell Rate Algorithm (GCRA) Rate Limiter.
 *
 * Implements a virtual clock leaky bucket (ITU-T I.371 / RFC).
 * Tracks Theoretical Arrival Time (TAT) per client key.
 * Allows bursts up to `maxRequests` and leaks at a steady rate of
 * `maxRequests / windowMs`.
 *
 * Emits both IETF Draft/RFC headers (`RateLimit`, `RateLimit-Policy`, `Retry-After`)
 * and legacy headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).
 */
export class TighGcraRateLimiter {
  private readonly config: RateLimitConfig;
  private readonly tat: Map<string, number> = new Map();
  private readonly stats = {
    totalRequests: 0,
    rejected: 0,
    byKey: new Map<string, { allowed: number; rejected: number }>(),
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: 60000,
      maxRequests: 100,
      strategy: 'gcra',
      ...config,
    };
    if (this.config.windowMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.windowMs * 2);
    }
  }

  private getKey(req: TighRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
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

  check(req: TighRequest): RateLimitResult {
    this.stats.totalRequests++;
    const key = this.getKey(req);
    const now = Date.now();

    const limit = Math.max(1, this.config.maxRequests);
    const windowMs = Math.max(1, this.config.windowMs);
    // Emission interval between permitted cells (ms per request)
    const interval = windowMs / limit;
    // Burst tolerance (burst allowance = windowMs)
    const tolerance = windowMs;

    const previousTAT = this.tat.get(key) ?? now;
    // Theoretical arrival time for this cell
    const tat = Math.max(previousTAT, now) + interval;

    let result: RateLimitResult;
    if (now >= tat - tolerance) {
      // Allowed: cell fits in window
      this.tat.set(key, tat);
      const used = Math.ceil((tat - now) / interval);
      const remaining = Math.max(0, limit - used);
      result = {
        allowed: true,
        remaining,
        resetAt: tat,
        limit,
        retryAfter: undefined,
      };
    } else {
      // Rejected: excess requests
      const retryAfter = Math.ceil((tat - tolerance - now) / 1000);
      result = {
        allowed: false,
        remaining: 0,
        resetAt: tat,
        limit,
        retryAfter: Math.max(1, retryAfter),
      };
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

  /**
   * Generates standard IETF and legacy rate limiting response headers.
   */
  headers(result: RateLimitResult): Record<string, string> {
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    const windowSec = Math.ceil((this.config.windowMs || 60000) / 1000);

    const headers: Record<string, string> = {
      // IETF RateLimit Header
      'RateLimit': `limit=${result.limit}; remaining=${result.remaining}; reset=${Math.floor(
        result.resetAt / 1000
      )}`,
      // IETF RateLimit-Policy Header
      'RateLimit-Policy': `${result.limit};w=${windowSec}`,
      'Retry-After': String(result.allowed ? retryAfterSec : (result.retryAfter ?? retryAfterSec)),
      // Legacy headers
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
    };

    if (!result.allowed && result.retryAfter) {
      headers['Retry-After'] = String(result.retryAfter);
    }

    return headers;
  }

  getStats() {
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
    const windowMs = this.config.windowMs;
    for (const [key, t] of this.tat) {
      if (now - t > windowMs * 3) {
        this.tat.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.tat.clear();
  }
}
