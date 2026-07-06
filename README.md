# Tigh

A lightweight, composable TypeScript API engine with built-in routing, caching, rate limiting, circuit breaking, middleware support, and comprehensive metrics.

## Features

- **Routing** — Fast trie-based routing with path parameters and wildcards
- **Caching** — LRU cache with TTL support and pattern-based invalidation
- **Rate Limiting** — Token bucket, sliding window, and fixed window strategies
- **Circuit Breaker** — Automatic failure detection and recovery
- **Middleware** — Chainable middleware with CORS and timing out of the box
- **Metrics** — Built-in request tracking, latency percentiles, and performance analytics
- **Next.js Adapter** — Drop-in integration for Next.js API routes

## Installation

```bash
npm install tigh
```

## Quick Start

```typescript
import { Tigh } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
  enableMetrics: true,
});

engine.get('/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quote: `Quote ${req.params.id}` },
  };
});

const response = await engine.handle('GET', '/quotes/42', {
  method: 'GET',
  path: '/quotes/42',
  headers: {},
  query: {},
  params: {},
  timestamp: Date.now(),
});
```

## API Reference

### Creating an Engine

```typescript
const engine = new Tigh(config?: Partial<EngineConfig>);
```

**Configuration Options:**

```typescript
interface EngineConfig {
  cache: {
    maxSize: number;           // Default: 10000
    defaultTTL: number;        // Default: 60000ms
    checkInterval: number;     // Default: 30000ms
  };
  rateLimit: {
    windowMs: number;          // Default: 60000ms
    maxRequests: number;       // Default: 100
    strategy: 'token-bucket' | 'sliding-window' | 'fixed-window'; // Default: 'token-bucket'
  };
  circuitBreaker: {
    failureThreshold: number;  // Default: 5
    recoveryTimeout: number;   // Default: 30000ms
    halfOpenMaxAttempts: number; // Default: 3
    monitoringPeriod: number;  // Default: 60000ms
  };
  enableMetrics: boolean;      // Default: true
  enableCache: boolean;        // Default: true
  enableRateLimit: boolean;    // Default: true
  enableCircuitBreaker: boolean; // Default: true
  cors: {
    origin: string | string[]; // Default: '*'
    methods: string[];         // Default: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    headers: string[];         // Default: ['Content-Type', 'Authorization', 'X-Request-Id']
    maxAge: number;            // Default: 86400
  };
}
```

### Defining Routes

**Shorthand Methods:**

```typescript
engine.get(path, handler, options?);
engine.post(path, handler, options?);
engine.put(path, handler, options?);
engine.delete(path, handler, options?);
```

**Generic Route Method:**

```typescript
engine.route({
  method: 'GET',
  path: '/users/:id',
  handler: async (req) => ({ ... }),
  middlewares: [customMiddleware],
  cache: { ttl: 120000 },
  rateLimit: { maxRequests: 50 },
});
```

### Route Handler

```typescript
type RouteHandler = (req: Request) => Promise<Response> | Response;

interface Request {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: RouteParams;
  body?: unknown;
  ip?: string;
  timestamp: number;
}

interface Response {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
```

### Path Parameters and Wildcards

```typescript
// Named parameters: /users/:id -> params.id = "123"
engine.get('/users/:id', handler);

// Wildcard routes: /static/* -> params['*'] = "css/style.css"
engine.get('/static/*', handler);
```

### Caching

Enable caching per route:

```typescript
engine.get(
  '/quotes/random',
  async (req) => ({ status: 200, headers: {}, body: { quote: '...' } }),
  {
    cache: {
      ttl: 300000, // 5 minutes
      key: (req) => `quote:random`, // Custom cache key
    },
  }
);
```

The response includes `X-Cache: HIT` or `X-Cache: MISS` headers.

**Invalidate cache patterns:**

```typescript
engine.invalidateCache('quote:*'); // Invalidates all keys matching 'quote:*'
```

### Rate Limiting

Rate limiting is applied globally by default. Customize per request IP:

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    strategy: 'token-bucket',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  },
});
```

Rate-limited responses return `429 Too Many Requests` with headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <timestamp>
Retry-After: 60
```

### Middleware

Use middleware to customize request/response handling:

```typescript
engine.use(async (req, next) => {
  console.log(`${req.method} ${req.path}`);
  const res = await next();
  console.log(`Response: ${res.status}`);
  return res;
});
```

**Built-in Middleware:**

- `corsMiddleware` — Handle CORS preflight and headers
- `timingMiddleware` — Add `X-Response-Time` and `X-Request-Id` headers
- `compressMiddleware` — Gzip compression for responses > 1KB

### Circuit Breaker

Automatically open circuit when failures exceed threshold:

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
  },
});
```

Responses when circuit is open return `503 Service Unavailable`:

```json
{
  "error": "Service Unavailable",
  "message": "Circuit breaker is open. Please retry later."
}
```

### Metrics

Capture performance snapshots:

```typescript
const metrics = engine.flushMetrics();

console.log(metrics.requests.total);        // Total requests
console.log(metrics.latency.p99);           // 99th percentile latency
console.log(metrics.cache.hitRate);         // Cache hit rate
console.log(metrics.circuitBreaker.state);  // 'open' | 'closed' | 'half-open'
```

## Next.js Integration

Use the adapter to integrate with Next.js API routes:

```typescript
// app/api/quotes/[id]/route.ts
import { Tigh, createNextHandler } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
});

engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, quote: '...' },
  };
});

export const GET = createNextHandler(engine);
```

## License

MIT
