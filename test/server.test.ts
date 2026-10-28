import { describe, test, expect } from 'bun:test';
import {
  TighEngine,
  jsonBody,
  textBody,
  emptyBody,
  problemResponse,
} from '../src/server';

describe('TighEngine (Full Web-Standard Server)', () => {
  test('handles basic GET and returns jsonBody with pre-serialized Uint8Array', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/hello', async () => {
      return jsonBody({ message: 'Hello, World!' });
    });

    const res = await engine.fetch(new Request('http://localhost/hello'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('etag')).toBeTruthy();

    const data = await res.json();
    expect(data.message).toBe('Hello, World!');
    engine.destroy();
  });

  test('extracts route params from bracket and colon routes', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/users/[id]', async (req) => {
      return jsonBody({ userId: req.params.id });
    });

    engine.get('/posts/:slug', async (req) => {
      return jsonBody({ postSlug: req.params.slug });
    });

    const res1 = await engine.fetch(new Request('http://localhost/users/42'));
    expect(res1.status).toBe(200);
    expect((await res1.json()).userId).toBe('42');

    const res2 = await engine.fetch(new Request('http://localhost/posts/announcement'));
    expect(res2.status).toBe(200);
    expect((await res2.json()).postSlug).toBe('announcement');
    engine.destroy();
  });

  test('prebuilt cache HIT and single-flight coalescing', async () => {
    const engine = new TighEngine({
      enableRateLimit: false,
      enableCache: true,
    });

    let calls = 0;
    engine.get(
      '/cached-item',
      async () => {
        calls++;
        return jsonBody({ timestamp: 12345 });
      },
      [],
      { cache: { ttl: 60000, key: () => 'static-key' } }
    );

    // First request: MISS
    const res1 = await engine.fetch(new Request('http://localhost/cached-item'));
    expect(res1.status).toBe(200);
    expect(res1.headers.get('x-cache')).toBe('MISS');
    expect(calls).toBe(1);

    // Second request: HIT
    const res2 = await engine.fetch(new Request('http://localhost/cached-item'));
    expect(res2.status).toBe(200);
    expect(res2.headers.get('x-cache')).toBe('HIT');
    expect(calls).toBe(1); // handler not called again
    engine.destroy();
  });

  test('ETag revalidation returns 304 Not Modified', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/etag-data', async () => {
      return jsonBody({ value: 'constant' });
    });

    const first = await engine.fetch(new Request('http://localhost/etag-data'));
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await engine.fetch(
      new Request('http://localhost/etag-data', {
        headers: { 'if-none-match': etag! },
      })
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    engine.destroy();
  });

  test('CORS headers and OPTIONS preflight response', async () => {
    const engine = new TighEngine({
      cors: { origin: 'https://example.com' },
      enableRateLimit: false,
    });
    engine.post('/api/action', async () => jsonBody({ ok: true }));

    // Preflight OPTIONS
    const preflight = await engine.fetch(
      new Request('http://localhost/api/action', { method: 'OPTIONS' })
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://example.com');

    // HEAD request
    const headRes = await engine.fetch(
      new Request('http://localhost/api/action', { method: 'HEAD' })
    );
    expect(headRes.status).toBe(404); // POST route, HEAD checks GET routes
    engine.destroy();
  });

  test('GCRA rate limiting enforces budget and emits IETF headers', async () => {
    const engine = new TighEngine({
      enableRateLimit: true,
      rateLimit: { windowMs: 60000, maxRequests: 2, strategy: 'gcra' },
    });
    engine.get('/rate-test', async () => jsonBody({ success: true }));

    const r1 = await engine.fetch(new Request('http://localhost/rate-test'));
    expect(r1.status).toBe(200);
    expect(r1.headers.get('ratelimit-policy')).toBeTruthy();
    expect(r1.headers.get('x-ratelimit-limit')).toBe('2');

    const r2 = await engine.fetch(new Request('http://localhost/rate-test'));
    expect(r2.status).toBe(200);

    const r3 = await engine.fetch(new Request('http://localhost/rate-test'));
    expect(r3.status).toBe(429);
    expect(r3.headers.get('retry-after')).toBeTruthy();
    engine.destroy();
  });

  test('returns 404 RFC 7807 problem details for missing routes', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    const res = await engine.fetch(new Request('http://localhost/not-found'));

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('problem+json');
    const body = await res.json();
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    engine.destroy();
  });

  test('circuit breaker trips on downstream failures and returns 503', async () => {
    const engine = new TighEngine({
      enableRateLimit: false,
      enableCircuitBreaker: true,
      circuitBreaker: { failureThreshold: 2, recoveryTimeout: 100 },
    });

    let shouldFail = true;
    engine.get('/flaky', async () => {
      if (shouldFail) {
        throw new Error('Database connection failed');
      }
      return jsonBody({ ok: true });
    });

    // 1st failure (500)
    const res1 = await engine.fetch(new Request('http://localhost/flaky'));
    expect(res1.status).toBe(500);

    // 2nd failure (500) -> trips circuit breaker to open
    const res2 = await engine.fetch(new Request('http://localhost/flaky'));
    expect(res2.status).toBe(500);

    // 3rd call -> fails fast with 503 Service Unavailable
    const res3 = await engine.fetch(new Request('http://localhost/flaky'));
    expect(res3.status).toBe(503);
    expect(res3.headers.get('retry-after')).toBeTruthy();
    engine.destroy();
  });
});
