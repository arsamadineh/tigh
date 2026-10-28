export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

/**
 * Route parameter map extracted from dynamic path segments (e.g. :id or [id]).
 */
export type RouteParams = Record<string, string>;

/**
 * Internal request representation used by the router, middleware, and handlers.
 * Kept distinct from the Web-standard `Request` to avoid naming clashes at the
 * `fetch(Request): Promise<Response>` boundary.
 */
export interface TighRequest {
  method: HttpMethod;
  path: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: RouteParams;
  body: unknown;
  ip: string;
  timestamp: number;
}

/**
 * Internal response representation. Carries a pre-serialized `Uint8Array`
 * body so the cache and hot path never re-serialize JSON repeatedly.
 */
export interface TighResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

/**
 * Continuation function for middleware pipeline execution.
 */
export type NextFn = () => Promise<TighResponse>;

/**
 * Middleware function intercepting requests before and/or after route execution.
 */
export type MiddlewareFn = (req: TighRequest, next: NextFn) => Promise<TighResponse>;

/**
 * Route handler function producing a TighResponse.
 */
export type RouteHandler = (req: TighRequest) => Promise<TighResponse> | TighResponse;

/**
 * Internal registered route definition.
 */
export interface Route {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
  middlewares: MiddlewareFn[];
}

/**
 * Cache policy configuration for an individual route.
 */
export interface RouteCacheConfig {
  /** Custom cache key builder; defaults to `${method}:${path}?${sortedQuery}` */
  key?: (req: TighRequest) => string;
  /** Custom TTL in milliseconds for this route */
  ttl?: number;
  /** Predicate to bypass caching dynamically based on request */
  shouldCache?: (req: TighRequest) => boolean;
}

/**
 * Complete definition for registering a route with the engine.
 */
export interface EngineRoute {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
  middlewares?: MiddlewareFn[];
  cache?: RouteCacheConfig;
  rateLimit?: Partial<RateLimitConfig>;
}

/**
 * Global cache configuration.
 */
export interface CacheConfig {
  /** Maximum number of items held across all queues */
  maxSize: number;
  /** Default TTL in milliseconds for cached responses */
  defaultTTL: number;
  /** Periodic cleanup interval in milliseconds for expired items */
  checkInterval: number;
}

/**
 * Rate limiter configuration.
 */
export interface RateLimitConfig {
  /** Sliding window / cell interval window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed within windowMs */
  maxRequests: number;
  /** Algorithm strategy: 'gcra' (virtual clock leaky bucket), 'token-bucket', 'sliding-window', 'fixed-window' */
  strategy: 'gcra' | 'token-bucket' | 'sliding-window' | 'fixed-window';
  /** Custom client key generator (defaults to client IP from headers) */
  keyGenerator?: (req: TighRequest) => string;
}

/**
 * Result returned by the rate limiter check.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  retryAfter?: number;
}

/**
 * States of the circuit breaker state machine.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration parameters.
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before tripping to open */
  failureThreshold: number;
  /** Duration in milliseconds the circuit remains open before entering half-open */
  recoveryTimeout: number;
  /** Number of trial requests allowed in half-open state */
  halfOpenMaxAttempts: number;
  /** Rolling monitoring period in milliseconds */
  monitoringPeriod: number;
}

/**
 * Circuit breaker telemetry statistics.
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalTrips: number;
}

/**
 * Cache entry with value, expiration timestamp, and estimated byte size.
 */
export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  size: number;
}

/**
 * CORS configuration options.
 */
export interface CorsConfig {
  origin: string | string[];
  methods: string[];
  headers: string[];
  maxAge: number;
  credentials?: boolean;
}

/**
 * Telemetry and metrics snapshot.
 */
export interface MetricsSnapshot {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    byPath: Record<string, number>;
  };
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
    sampleSize: number;
    count?: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
    memoryBytes: number;
    hitRate: number;
    hitRatio?: number;
  };
  rateLimit: {
    totalRequests: number;
    rejected: number;
    byKey: Record<string, { allowed: number; rejected: number }>;
  };
  circuitBreaker: CircuitBreakerStats;
  uptime: number;
  startedAt: string;
  instanceId: string;
  timestamp: number;
}

/**
 * Complete engine configuration.
 */
export interface EngineConfig {
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  circuitBreaker: CircuitBreakerConfig;
  enableMetrics: boolean;
  enableCache: boolean;
  enableRateLimit: boolean;
  enableCircuitBreaker: boolean;
  cors: CorsConfig;
  problemBaseUrl?: string;
}

export type CreateEngineConfig = Partial<EngineConfig>;

/**
 * Unified Engine interface.
 */
export interface Engine {
  route(definition: EngineRoute): Engine;
  get(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  post(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  put(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  delete(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  patch(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  options(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  head(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine;
  use(middleware: MiddlewareFn): Engine;
  group(prefix: string, callback: (router: Engine) => void): Engine;
  handle(method: HttpMethod, path: string, req: TighRequest): Promise<TighResponse>;
  flushMetrics(): MetricsSnapshot;
  invalidateCache(pattern: string): number;
  destroy(): void;
  /** Web-standard Fetch API boundary */
  fetch(request: globalThis.Request): Promise<globalThis.Response>;
}

/* ==========================================================================
 * Legacy v0 Compatibility Types
 * Preserved for backward compatibility with existing applications.
 * ========================================================================== */

export interface Request {
  method: HttpMethod;
  path: string;
  url?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: RouteParams;
  body?: unknown;
  ip?: string;
  timestamp: number;
}

export interface Response {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  stream?: AsyncGenerator<Uint8Array>;
}

export type LegacyNextFn = () => Promise<Response>;
export type LegacyMiddlewareFn = (req: Request, next: LegacyNextFn) => Promise<Response> | Response;
export type LegacyRouteHandler = (req: Request) => Promise<Response> | Response;

export interface LegacyRoute {
  method: HttpMethod;
  path: string;
  handler: LegacyRouteHandler;
  middlewares: LegacyMiddlewareFn[];
}

export interface LegacyEngineRoute {
  method: HttpMethod;
  path: string;
  handler: LegacyRouteHandler;
  middlewares?: LegacyMiddlewareFn[];
  cache?: {
    ttl?: number;
    key?: (req: Request) => string;
  };
  rateLimit?: Partial<RateLimitConfig>;
}
