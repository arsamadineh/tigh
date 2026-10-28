import { describe, test, expect } from 'bun:test';
import { DDSketch, LatencyHistogram } from '../src/telemetry/ddsketch';
import { TighMetrics } from '../src/telemetry/metrics';

describe('DDSketch and LatencyHistogram', () => {
  test('accurately tracks quantiles with bounded memory', () => {
    const sketch = new DDSketch();
    for (let i = 1; i <= 100; i++) {
      sketch.add(i);
    }

    expect(sketch.count).toBe(100);
    expect(sketch.min).toBe(1);
    expect(sketch.max).toBe(100);
    expect(sketch.avg).toBeCloseTo(50.5, 1);

    // P50 should be approximately 50 (within bounded relative error)
    const p50 = sketch.p50();
    expect(p50).toBeGreaterThanOrEqual(45);
    expect(p50).toBeLessThanOrEqual(55);

    // P99 should be approximately 99
    const p99 = sketch.p99();
    expect(p99).toBeGreaterThanOrEqual(95);
    expect(p99).toBeLessThanOrEqual(100);
  });

  test('LatencyHistogram observes and reports percentiles', () => {
    const hist = new LatencyHistogram();
    hist.observe(10);
    hist.observe(20);
    hist.observe(30);

    expect(hist.count).toBe(3);
    expect(hist.min).toBe(10);
    expect(hist.max).toBe(30);
    expect(hist.avg).toBe(20);

    hist.reset();
    expect(hist.count).toBe(0);
  });
});

describe('TighMetrics', () => {
  test('records requests, statuses, and produces accurate snapshot', () => {
    const metrics = new TighMetrics({ instanceId: 'test-instance' });

    metrics.recordRequest('GET', '/api/users', 200, 15);
    metrics.recordRequest('GET', '/api/users', 200, 25);
    metrics.recordRequest('POST', '/api/users', 201, 40);
    metrics.recordRequest('GET', '/api/users/123', 404, 5);

    metrics.updateCacheStats(80, 20, 150, 4096);
    metrics.updateRateLimitStats(105, 5, {
      '127.0.0.1': { allowed: 100, rejected: 5 },
    });

    const snapshot = metrics.snapshot();

    expect(snapshot.instanceId).toBe('test-instance');
    expect(snapshot.requests.total).toBe(4);
    expect(snapshot.requests.byMethod['GET']).toBe(3);
    expect(snapshot.requests.byMethod['POST']).toBe(1);
    expect(snapshot.requests.byStatus['200']).toBe(2);
    expect(snapshot.requests.byStatus['201']).toBe(1);
    expect(snapshot.requests.byStatus['404']).toBe(1);

    expect(snapshot.cache.hitRatio).toBe(0.8);
    expect(snapshot.cache.hits).toBe(80);
    expect(snapshot.cache.misses).toBe(20);
    expect(snapshot.cache.size).toBe(150);
    expect(snapshot.cache.memoryBytes).toBe(4096);

    expect(snapshot.rateLimit.totalRequests).toBe(105);
    expect(snapshot.rateLimit.rejected).toBe(5);

    expect(snapshot.latency.count).toBe(4);
    expect(snapshot.latency.p50).toBeGreaterThan(0);
  });

  test('generates Prometheus exposition format cleanly', () => {
    const metrics = new TighMetrics();
    metrics.recordRequest('GET', '/health', 200, 5);
    const prom = metrics.toPrometheus();

    expect(prom).toContain('tigh_requests_total');
    expect(prom).toContain('path="/health"');
    expect(prom).toContain('method="GET"');
    expect(prom).toContain('status="200"');
    expect(prom).toContain('tigh_latency_seconds_bucket');
    expect(prom).toContain('tigh_cache_hit_ratio');
  });
});
