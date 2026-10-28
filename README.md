# Tigh ⚡

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun%20%7C%20Node%20%7C%20Cloudflare%20%7C%20Next.js-black.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-green.svg)]()
[![Tests](https://img.shields.io/badge/Tests-53%20Passing-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Tigh** (`تیغ` — Persian for *Blade/Razor*) is an ultra-fast, zero-dependency, multi-runtime TypeScript API engine designed for high-concurrency microservices and edge APIs.

Originally extracted and refined with extreme performance budgets, Tigh is completely decoupled, standalone, and flexible for **any** backend project or runtime.

---

## 🚀 Key Architectural Highlights

- ⚡ **Compiled Radix (Patricia) Trie Router**: Sub-microsecond route matching with zero memory allocations during lookup. Full support for bracket syntax `[param]`, colon syntax `:param`, wildcards `*`, and NFC Unicode normalization.
- 💾 **Prebuilt S3-FIFO Cache**: Stores pre-serialized `Uint8Array` response fragments. Hot-path cache hits **never** call `JSON.stringify` or `JSON.parse`. Features 3-queue S3-FIFO eviction (`in`, `probation`, `main`) with W-TinyLFU ghost ledger admission.
- 🛫 **Single-Flight Request Coalescing**: Prevents cache thundering herds under high concurrency by collapsing identical concurrent backend fetches into a single promise.
- 🛡️ **GCRA Virtual Clock Rate Limiter**: Generic Cell Rate Algorithm provides smooth traffic shaping and emits standard **IETF RFC headers** (`RateLimit`, `RateLimit-Policy`, `Retry-After`) alongside legacy `X-RateLimit-*`.
- 🔌 **Circuit Breaker State Machine**: Three states (`closed`, `open`, `half-open`) protect downstream databases and microservices with automatic recovery and 503 fast-fail.
- 📊 **Bounded DDSketch Telemetry**: High-precision streaming quantile estimation (P50, P90, P95, P99) with logarithmic bucketing and zero unbounded memory growth. Built-in Prometheus format generator.
- 🌐 **Web-Standard `fetch()` Boundary**: Built around standard `Request` and `Response`. Works seamlessly across **Bun**, **Cloudflare Workers**, **Next.js App Router**, and **Node.js**.
- 🔄 **100% Backward Compatible**: Full compatibility layer with legacy v0 Tigh APIs.

---

## 📦 Installation

```bash
# npm
npm install tigh

# bun
bun add tigh

# pnpm
pnpm add tigh
```

---

## 🏁 Quick Start

### 1. Minimal Web-Standard Server

```typescript
import { TighEngine, jsonBody } from 'tigh';

const app = new TighEngine();

// Define routes
app.get('/api/users/[id]', async (req) => {
  return jsonBody({
    userId: req.params.id,
    name: 'Alice',
    timestamp: Date.now(),
  });
});

// Use standard Request / Response
const response = await app.fetch(new Request('http://localhost/api/users/42'));
console.log(await response.json());
```

---

## 🌍 Multi-Runtime Adapters

Tigh provides first-class, zero-glue adapters for all modern JavaScript runtimes.

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

### Node.js (`http.createServer` & Express / Connect)

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

## 🛠️ Deep Dive: Core Modules

### 1. Compiled Radix Trie Router (`TighRadixRouter`)

High-throughput router featuring zero allocations per lookup and segment edge splitting.

```typescript
import { TighRadixRouter } from 'tigh/router';

const router = new TighRadixRouter();

// Static routes
router.addRoute('GET', '/api/health', healthHandler);

// Dynamic parameters (both bracket and colon syntax supported)
router.addRoute('GET', '/api/users/[id]', userHandler);
router.addRoute('GET', '/api/posts/:slug', postHandler);

// Wildcard routes
router.addRoute('GET', '/static/*', assetHandler);

// Match
const match = router.match('GET', '/api/users/123');
// match.params -> { id: '123' }
```

### 2. S3-FIFO Prebuilt Response Cache (`PrebuiltCache`)

Stores pre-serialized `Uint8Array` byte fragments. Avoids runtime `JSON.stringify` on cached hot paths.

```typescript
import { PrebuiltCache, withSingleFlight } from 'tigh/cache';

const cache = new PrebuiltCache({
  maxSize: 5000,
  defaultTTL: 60000, // 60s
});

// Single-flight coalescing prevents concurrent duplicate work
const bytes = await withSingleFlight(cache, 'product:101', async () => {
  const data = await fetchFromDatabase('101');
  return new TextEncoder().encode(JSON.stringify(data));
}, 60000);
```

### 3. GCRA Virtual Clock Rate Limiter (`TighGcraRateLimiter`)

Implements the **Generic Cell Rate Algorithm** (GCRA / virtual leaky bucket) conforming to the latest IETF RateLimit specification.

```typescript
import { TighGcraRateLimiter } from 'tigh/rate-limiter';

const limiter = new TighGcraRateLimiter({
  maxRequests: 100, // burst budget
  windowMs: 60000,  // emission window
});

const result = limiter.check(req);
// Emits IETF headers:
// RateLimit: limit=100, remaining=99, reset=1
// RateLimit-Policy: 100;w=60
// Retry-After: 5 (when throttled)
```

### 4. Circuit Breaker (`TighCircuitBreaker`)

Prevents cascading downstream service failures with automatic recovery.

```typescript
import { TighCircuitBreaker, CircuitOpenError } from 'tigh/circuit-breaker';

const breaker = new TighCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000,
  halfOpenMaxAttempts: 3,
});

try {
  const result = await breaker.execute(() => callUpstreamService());
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // Fail fast with 503 and Retry-After
    console.log(`Circuit open. Retry after ${err.retryAfter}s`);
  }
}
```

### 5. Bounded Telemetry & Prometheus (`TighMetrics`, `DDSketch`)

Maintains streaming percentiles (P50, P90, P95, P99) with strictly bounded memory.

```typescript
import { TighMetrics } from 'tigh/telemetry';

const metrics = new TighMetrics();
metrics.recordRequest('GET', '/api/items', 200, 1.4); // 1.4ms latency

// Get telemetry snapshot
const snapshot = metrics.snapshot();
console.log(`P99 Latency: ${snapshot.latency.p99}ms`);
console.log(`Cache Hit Rate: ${snapshot.cache.hitRate * 100}%`);

// Export Prometheus Exposition Format
const prometheusOutput = metrics.toPrometheus();
```

---

## 💡 Showcase Use Cases

### Use Case 1: High-Traffic Microservice with Cache Invalidation & Auth

```typescript
import { TighEngine, jsonBody, problemResponse } from 'tigh';

const engine = new TighEngine({
  enableCache: true,
  enableRateLimit: true,
  enableCircuitBreaker: true,
});

// Grouped API versioning
engine.group('/v1', (v1) => {
  // Cached items endpoint
  v1.get('/items', async () => {
    const items = await loadItemsFromDb();
    return jsonBody(items);
  }, {
    cache: { ttl: 60000, key: () => 'items:all' }
  });

  // Mutating endpoint with pattern-based cache invalidation
  v1.post('/items', async (req) => {
    if (req.headers['authorization'] !== 'Bearer secret-token') {
      return problemResponse(401, 'Unauthorized', 'Invalid bearer token');
    }

    const newItem = await saveItem(req.body);
    engine.invalidateCache('items:*'); // Flush matching cache keys
    return jsonBody(newItem, 201);
  });
});
```

### Use Case 2: Conditional HTTP Revalidation (ETag & 304 Not Modified)

Tigh computes lightweight deterministic ETags automatically. When clients send `If-None-Match`, Tigh instantly yields a **304 Not Modified** with zero body transmission:

```typescript
const res1 = await engine.fetch(new Request('http://localhost/data'));
const etag = res1.headers.get('etag');

// Second request with ETag
const res2 = await engine.fetch(new Request('http://localhost/data', {
  headers: { 'if-none-match': etag! }
}));

console.log(res2.status); // 304
console.log(res2.body);   // null (Zero network transfer)
```

---

## 🧪 Testing & Verification

Tigh has a comprehensive test suite covering routing, edge-splitting, S3-FIFO eviction, GCRA rates, circuit breaking, telemetry, and all adapters:

```bash
bun test
```

```
bun test v1.4.4
✓ TighRadixRouter > 11 tests pass
✓ PrebuiltCache & S3-FIFO > 13 tests pass
✓ TighGcraRateLimiter > 7 tests pass
✓ TighCircuitBreaker > 5 tests pass
✓ DDSketch & TighMetrics > 4 tests pass
✓ TighEngine (Full Web Server) > 8 tests pass
✓ Multi-Runtime Adapters > 5 tests pass

 53 pass
 0 fail
 Ran 53 tests across 7 files. [250ms]
```

---

## 📄 License

MIT © [Arsam Adineh](https://github.com/ArsamAdineh)
