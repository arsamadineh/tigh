# Tigh

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun%20%7C%20Node%20%7C%20Cloudflare%20%7C%20Next.js-black.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-green.svg)]()
[![Tests](https://img.shields.io/badge/Tests-53%20Passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Tigh (`تیغ`, Persian for *Blade*) is a zero-dependency TypeScript API engine built around standard Web APIs (`Request` and `Response`). It includes a compiled radix trie router, pre-serialized S3-FIFO fragment cache, GCRA virtual-clock rate limiting, a three-state circuit breaker, and bounded DDSketch latency telemetry.

Designed to run anywhere with no runtime-specific locks, Tigh works identically across Bun, Cloudflare Workers, Next.js App Router, and Node.js.

---

## Architecture & Features

- **Compiled Radix Trie Router**: Path routing with static edge compression, bracket params (`[id]`), colon params (`:id`), and wildcard support (`*`). Paths are decoded and normalized to Unicode NFC with zero string allocations during matching.
- **Prebuilt S3-FIFO Cache**: Caches responses as pre-serialized `Uint8Array` fragments. Cache hits bypass `JSON.stringify` and `JSON.parse` entirely. Eviction uses S3-FIFO queues (`in`, `probation`, `main`) combined with a W-TinyLFU ghost ledger.
- **Single-Flight Request Coalescing**: Collapses identical concurrent misses into a single pending execution to prevent cache stampedes.
- **GCRA Rate Limiter**: Generic Cell Rate Algorithm leaky bucket emitting standard IETF headers (`RateLimit`, `RateLimit-Policy`, `Retry-After`) and legacy `X-RateLimit-*` headers.
- **Circuit Breaker**: Tracks downstream failure rates through `closed`, `open`, and `half-open` states with fast-fail 503 responses and trial probes.
- **DDSketch Telemetry**: Memory-bounded streaming quantile estimator (P50, P90, P95, P99) with logarithmic buckets and native Prometheus exposition format.
- **Web-Standard Fetch Boundary**: The core server exposes `fetch(request: Request): Promise<Response>`, enabling drop-in integration with modern edge runtimes.
- **Backward Compatibility**: Fully backward compatible with legacy v0 interfaces and configuration options.

---

## Installation

```bash
# npm
npm install tigh

# bun
bun add tigh

# pnpm
pnpm add tigh
```

---

## Quick Start

```typescript
import { TighEngine, jsonBody } from 'tigh';

const app = new TighEngine();

app.get('/api/users/[id]', async (req) => {
  return jsonBody({
    userId: req.params.id,
    name: 'Alice',
    timestamp: Date.now(),
  });
});

// Using standard Request / Response
const response = await app.fetch(new Request('http://localhost/api/users/42'));
console.log(await response.json());
```

---

## Runtime Adapters

Tigh includes built-in adapters for major runtimes and frameworks.

### Bun (`Bun.serve`)

```typescript
import { TighEngine, jsonBody } from 'tigh';
import { createBunHandler } from 'tigh/adapters/bun';

const engine = new TighEngine();
engine.get('/hello', async () => jsonBody({ hello: 'world' }));

Bun.serve({
  port: 3000,
  fetch: createBunHandler(engine),
});
```

### Cloudflare Workers

```typescript
import { TighEngine, jsonBody } from 'tigh';
import { createCloudflareHandler } from 'tigh/adapters/cloudflare';

const engine = new TighEngine();
engine.get('/edge', async () => jsonBody({ edge: true, region: 'global' }));

export default {
  fetch: createCloudflareHandler(engine),
};
```

### Next.js App Router (`app/api/[...route]/route.ts`)

```typescript
import { TighEngine, jsonBody } from 'tigh';
import { createNextHandler } from 'tigh/adapters/next';

const engine = new TighEngine();
engine.get('/api/greeting', async () => jsonBody({ message: 'Hello from Next.js' }));

export const GET = createNextHandler(engine);
export const POST = createNextHandler(engine);
export const OPTIONS = createNextHandler(engine);
```

### Node.js (`http.createServer` and Express / Connect)

```typescript
import http from 'node:http';
import { TighEngine, jsonBody } from 'tigh';
import { createNodeHandler } from 'tigh/adapters/node';

const engine = new TighEngine();
engine.get('/node', async () => jsonBody({ runtime: 'node' }));

const server = http.createServer(createNodeHandler(engine));
server.listen(3000, () => console.log('Listening on http://localhost:3000'));
```

---

## Core Modules

### 1. Radix Router (`TighRadixRouter`)

Compiled radix trie with zero-allocation matching and automatic segment splitting:

```typescript
import { TighRadixRouter } from 'tigh/router';

const router = new TighRadixRouter();

// Static routes
router.addRoute('GET', '/health', healthHandler);

// Dynamic parameters (bracket and colon syntax)
router.addRoute('GET', '/users/[id]', userHandler);
router.addRoute('GET', '/posts/:slug', postHandler);

// Wildcard routes
router.addRoute('GET', '/static/*', assetHandler);

// Match
const match = router.match('GET', '/users/123');
// match.params -> { id: '123' }
```

### 2. S3-FIFO Prebuilt Response Cache (`PrebuiltCache`)

Stores pre-serialized `Uint8Array` bytes and handles coalescing:

```typescript
import { PrebuiltCache, withSingleFlight } from 'tigh/cache';

const cache = new PrebuiltCache({
  maxSize: 5000,
  defaultTTL: 60000,
});

// Single-flight coalescing prevents concurrent duplicate database calls
const bytes = await withSingleFlight(cache, 'product:101', async () => {
  const data = await fetchFromDatabase('101');
  return new TextEncoder().encode(JSON.stringify(data));
}, 60000);
```

### 3. GCRA Rate Limiter (`TighGcraRateLimiter`)

Generic Cell Rate Algorithm virtual clock with standard IETF headers:

```typescript
import { TighGcraRateLimiter } from 'tigh/rate-limiter';

const limiter = new TighGcraRateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});

const result = limiter.check(req);
// Emits headers:
// RateLimit: limit=100, remaining=99, reset=1
// RateLimit-Policy: 100;w=60
// Retry-After: 5 (when rejected)
```

### 4. Circuit Breaker (`TighCircuitBreaker`)

Protects downstream dependencies from cascading failures:

```typescript
import { TighCircuitBreaker, CircuitOpenError } from 'tigh/circuit-breaker';

const breaker = new TighCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000,
  halfOpenMaxAttempts: 3,
});

try {
  const result = await breaker.execute(() => callDatabase());
} catch (err) {
  if (err instanceof CircuitOpenError) {
    console.log(`Circuit open. Retry after ${err.retryAfter}s`);
  }
}
```

### 5. DDSketch Telemetry (`TighMetrics`, `DDSketch`)

Streaming quantile estimation with bounded memory:

```typescript
import { TighMetrics } from 'tigh/telemetry';

const metrics = new TighMetrics();
metrics.recordRequest('GET', '/api/items', 200, 1.4);

const snapshot = metrics.snapshot();
console.log(`P99 Latency: ${snapshot.latency.p99}ms`);
console.log(`Cache Hit Rate: ${snapshot.cache.hitRate * 100}%`);

// Prometheus exposition format
const prometheusOutput = metrics.toPrometheus();
```

---

## Use Cases

### Microservice with Route Grouping & Auth

```typescript
import { TighEngine, jsonBody, problemResponse } from 'tigh';

const engine = new TighEngine({
  enableCache: true,
  enableRateLimit: true,
  enableCircuitBreaker: true,
});

engine.group('/v1', (v1) => {
  v1.get('/items', async () => {
    const items = await loadItemsFromDb();
    return jsonBody(items);
  }, {
    cache: { ttl: 60000, key: () => 'items:all' }
  });

  v1.post('/items', async (req) => {
    if (req.headers['authorization'] !== 'Bearer secret-token') {
      return problemResponse(401, 'Unauthorized', 'Invalid bearer token');
    }

    const newItem = await saveItem(req.body);
    engine.invalidateCache('items:*');
    return jsonBody(newItem, 201);
  });
});
```

### Conditional HTTP Revalidation (ETag and 304 Not Modified)

Tigh computes deterministic ETags automatically. When clients send `If-None-Match`, matching responses return 304 without transmitting the body:

```typescript
const res1 = await engine.fetch(new Request('http://localhost/data'));
const etag = res1.headers.get('etag');

const res2 = await engine.fetch(new Request('http://localhost/data', {
  headers: { 'if-none-match': etag! }
}));

console.log(res2.status); // 304
console.log(res2.body);   // null
```

---

## Testing

```bash
bun test
```

```
bun test v1.4.4
PASS test/router.test.ts (11 tests)
PASS test/cache.test.ts (13 tests)
PASS test/rate-limiter.test.ts (7 tests)
PASS test/circuit-breaker.test.ts (5 tests)
PASS test/telemetry.test.ts (4 tests)
PASS test/server.test.ts (8 tests)
PASS test/adapters.test.ts (5 tests)

53 pass
0 fail
Ran 53 tests across 7 files. [250ms]
```

---

## License

MIT (c) Arsam Adineh
