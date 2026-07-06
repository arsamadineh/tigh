# Tigh Usage Guide

## Table of Contents
1. [Installation](#installation)
2. [Basic Setup](#basic-setup)
3. [Routing](#routing)
4. [Caching](#caching)
5. [Rate Limiting](#rate-limiting)
6. [Middleware](#middleware)
7. [Circuit Breaker](#circuit-breaker)
8. [Metrics](#metrics)
9. [Real-World Example](#real-world-example)

## Installation

```bash
npm install tigh
```

## Basic Setup

```typescript
import { Tigh } from 'tigh';

// Create engine with default config
const engine = new Tigh();

// Or with custom config
const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
  enableMetrics: true,
  enableCircuitBreaker: true,
});
```

## Routing

### Simple Routes

```typescript
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
});

engine.post('/api/quotes', async (req) => {
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, ...req.body },
  };
});

engine.delete('/api/quotes/:id', async (req) => {
  return {
    status: 204,
    headers: {},
    body: null,
  };
});
```

### Path Parameters

```typescript
engine.get('/api/posts/:postId/comments/:commentId', async (req) => {
  const { postId, commentId } = req.params;
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { postId, commentId },
  };
});
```

### Query Parameters

```typescript
engine.get('/api/search', async (req) => {
  const { q, limit } = req.query;
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { query: q, results: [] },
  };
});
```

## Caching

### Enable Caching

```typescript
engine.get(
  '/api/config',
  async (req) => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { config: 'data' },
    };
  },
  {
    cache: {
      ttl: 3600000, // 1 hour
    },
  }
);
```

### Custom Cache Keys

```typescript
engine.get(
  '/api/user/:userId/profile',
  async (req) => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { profile: 'data' },
    };
  },
  {
    cache: {
      ttl: 300000,
      key: (req) => `user:${req.params.userId}:profile`,
    },
  }
);
```

### Cache Invalidation

```typescript
engine.invalidateCache('user:*:profile');
engine.invalidateCache('quote:*');
```

## Rate Limiting

### Global Rate Limit

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    strategy: 'token-bucket',
  },
});
```

### Custom Key Generator

```typescript
const engine = new Tigh({
  rateLimit: {
    keyGenerator: (req) => {
      return req.headers['x-user-id'] || req.ip;
    },
  },
});
```

## Middleware

### Built-in Middleware

```typescript
import { corsMiddleware, timingMiddleware } from 'tigh';

engine.use(corsMiddleware({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization'],
}));

engine.use(timingMiddleware());
```

### Custom Middleware

```typescript
engine.use(async (req, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  const res = await next();
  console.log(`← ${res.status}`);
  return res;
});
```

## Circuit Breaker

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
  },
});
```

## Metrics

```typescript
const metrics = engine.flushMetrics();

console.log(metrics.requests.total);
console.log(metrics.latency.p99);
console.log(metrics.cache.hitRate);
console.log(metrics.circuitBreaker.state);
```

## Real-World Example

```typescript
import { Tigh, corsMiddleware } from 'tigh';

const engine = new Tigh({
  cache: { maxSize: 5000, defaultTTL: 300000 },
  rateLimit: { windowMs: 60000, maxRequests: 1000 },
  enableMetrics: true,
});

engine.use(corsMiddleware({ origin: '*' }));

// List quotes (cached 5 minutes)
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
}, { cache: { ttl: 300000 } });

// Get quote by ID (cached per ID)
engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, text: 'Quote text...' },
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => `quote:${req.params.id}`,
  },
});

// Create quote
engine.post('/api/quotes', async (req) => {
  const { text } = req.body as { text: string };
  
  // Invalidate list cache
  engine.invalidateCache('quote:*');
  
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: Date.now(), text },
  };
});

// Cleanup on shutdown
process.on('SIGINT', () => {
  engine.destroy();
  process.exit(0);
});
```

## Best Practices

1. Cache strategically - focus on read-heavy data
2. Monitor metrics - set up alerts for anomalies
3. Test circuit breaker - simulate failures to verify recovery
4. Clean up resources - call `engine.destroy()` on shutdown
5. Use appropriate TTLs - balance freshness with performance
