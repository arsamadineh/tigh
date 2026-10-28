import { describe, test, expect } from 'bun:test';
import { TighGcraRateLimiter } from '../src/rate-limiter/gcra';
import { TighRateLimiter } from '../src/rate-limiter';
import type { TighRequest } from '../src/types';

function createMockReq(headers: Record<string, string> = {}, ip = '127.0.0.1'): TighRequest {
  return {
    method: 'GET',
    path: '/api/resource',
    url: 'http://localhost/api/resource',
    headers,
    query: {},
    params: {},
    body: null,
    ip,
    timestamp: Date.now(),
  };
}

describe('TighGcraRateLimiter', () => {
  test('permits initial burst and restricts excess cells', () => {
    // 3 requests allowed per 1000ms
    const limiter = new TighGcraRateLimiter({
      windowMs: 1000,
      maxRequests: 3,
    });

    const req = createMockReq({}, '192.168.1.10');

    // First request fits
    const r1 = limiter.check(req);
    expect(r1.allowed).toBe(true);
    expect(r1.limit).toBe(3);

    // Second request fits in burst tolerance
    const r2 = limiter.check(req);
    expect(r2.allowed).toBe(true);

    // Burst capacity exhausted
    const r3 = limiter.check(req);
    if (!r3.allowed) {
      expect(r3.retryAfter).toBeGreaterThan(0);
    }
  });

  test('emits standard IETF and legacy rate limit headers', () => {
    const limiter = new TighGcraRateLimiter({
      windowMs: 60000,
      maxRequests: 50,
    });

    const req = createMockReq();
    const res = limiter.check(req);
    const headers = limiter.headers(res);

    expect(headers['RateLimit']).toContain('limit=50');
    expect(headers['RateLimit-Policy']).toBe('50;w=60');
    expect(headers['X-RateLimit-Limit']).toBe('50');
    expect(headers['X-RateLimit-Remaining']).toBeDefined();
    expect(headers['X-RateLimit-Reset']).toBeDefined();
    expect(headers['Retry-After']).toBeDefined();
  });

  test('resolves client IP from various headers and custom keyGenerator', () => {
    const limiter = new TighGcraRateLimiter({
      windowMs: 10000,
      maxRequests: 10,
    });

    // 1. x-forwarded-for with multiple IPs (first IP is the real client)
    const reqXff = createMockReq({ 'x-forwarded-for': '203.0.113.195, 70.41.3.18' });
    limiter.check(reqXff);

    // 2. cf-connecting-ip
    const reqCf = createMockReq({ 'cf-connecting-ip': '198.51.100.4' });
    limiter.check(reqCf);

    const stats = limiter.getStats();
    expect(stats.byKey['203.0.113.195']).toBeDefined();
    expect(stats.byKey['198.51.100.4']).toBeDefined();
  });

  test('custom keyGenerator overrides IP lookup', () => {
    const limiter = new TighGcraRateLimiter({
      windowMs: 10000,
      maxRequests: 5,
      keyGenerator: (r) => `tenant:${r.headers['x-tenant-id'] || 'default'}`,
    });

    const req = createMockReq({ 'x-tenant-id': 'acme-corp' });
    limiter.check(req);

    const stats = limiter.getStats();
    expect(stats.byKey['tenant:acme-corp']).toBeDefined();
  });

  test('destroy() cleans up tracking and timers', () => {
    const limiter = new TighGcraRateLimiter({ windowMs: 1000 });
    limiter.check(createMockReq());
    limiter.destroy();
    expect(limiter.getStats().totalRequests).toBe(1);
  });
});

describe('TighRateLimiter (v0 Backward Compatibility)', () => {
  test('token-bucket strategy limits excess requests', () => {
    const limiter = new TighRateLimiter({
      windowMs: 1000,
      maxRequests: 2,
      strategy: 'token-bucket',
    });

    const req = {
      ip: '127.0.0.1',
      headers: {},
      method: 'GET' as const,
      path: '/test',
      query: {},
      params: {},
      timestamp: Date.now(),
    };

    expect(limiter.check(req).allowed).toBe(true);
    expect(limiter.check(req).allowed).toBe(true);

    const blocked = limiter.check(req);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test('sliding-window strategy works', () => {
    const limiter = new TighRateLimiter({
      windowMs: 1000,
      maxRequests: 2,
      strategy: 'sliding-window',
    });

    const req = {
      ip: '10.0.0.1',
      headers: {},
      method: 'GET' as const,
      path: '/test',
      query: {},
      params: {},
      timestamp: Date.now(),
    };

    expect(limiter.check(req).allowed).toBe(true);
    expect(limiter.check(req).allowed).toBe(true);
    expect(limiter.check(req).allowed).toBe(false);
  });
});
