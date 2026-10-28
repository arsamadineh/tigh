import type {
  Engine,
  EngineConfig,
  EngineRoute,
  HttpMethod,
  MiddlewareFn,
  NextFn,
  RouteCacheConfig,
  RouteHandler,
  RouteParams,
  TighRequest,
  TighResponse,
  MetricsSnapshot,
} from './types';
import { TighRadixRouter, normalizePath } from './router/radix-router';
import { PrebuiltCache, withSingleFlight } from './cache/prebuilt-cache';
import { TighGcraRateLimiter } from './rate-limiter/gcra';
import { TighCircuitBreaker, CircuitOpenError } from './circuit-breaker/circuit-breaker';
import { TighMetrics } from './telemetry/metrics';

export const DEFAULT_CONFIG: EngineConfig = {
  cache: { maxSize: 2000, defaultTTL: 60000, checkInterval: 30000 },
  rateLimit: { windowMs: 60000, maxRequests: 100, strategy: 'gcra' },
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
    monitoringPeriod: 60000,
  },
  enableMetrics: true,
  enableCache: true,
  enableRateLimit: true,
  enableCircuitBreaker: true,
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    headers: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'X-Api-Key',
      'X-Request-Id',
    ],
    maxAge: 86400,
  },
  problemBaseUrl: 'about:blank',
};

function parseBool(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

function sortQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(query[k] ?? '')}`)
    .join('&');
}

/** Simple, deterministic djb2 hash for ETag generation (zero dependencies). */
export function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

/**
 * Builds an internal TighResponse with a pre-serialized Uint8Array body.
 * Pre-serializing ensures hot-path and cache hits never call JSON.stringify repeatedly.
 */
export function jsonBody(
  value: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): TighResponse {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(body);
  const etag = `W/"${simpleHash(body)}"`;
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=0',
      etag,
      ...extraHeaders,
    },
    body: bytes,
  };
}

/**
 * Builds an internal TighResponse with a plain-text Uint8Array body.
 */
export function textBody(
  value: string,
  status = 200,
  extraHeaders: Record<string, string> = {}
): TighResponse {
  const bytes = new TextEncoder().encode(value);
  const etag = `W/"${simpleHash(value)}"`;
  return {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, max-age=0',
      etag,
      ...extraHeaders,
    },
    body: bytes,
  };
}

/**
 * Builds an empty TighResponse (e.g. for 204 No Content).
 */
export function emptyBody(
  status = 204,
  extraHeaders: Record<string, string> = {}
): TighResponse {
  return { status, headers: extraHeaders, body: null };
}

/**
 * Builds an RFC 7807 Problem Details response.
 */
export function problemResponse(
  status: number,
  title: string,
  detail?: string,
  type = 'about:blank',
  extraHeaders: Record<string, string> = {}
): TighResponse {
  const body = JSON.stringify({ type, title, status, detail });
  return {
    status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body: new TextEncoder().encode(body),
  };
}

/**
 * Converts an internal TighResponse to a standard Fetch API Response.
 */
export function toWebResponse(res: TighResponse): globalThis.Response {
  const body = res.body === null ? null : (res.body as unknown as BodyInit);
  return new globalThis.Response(body, {
    status: res.status,
    headers: res.headers,
  });
}

/**
 * Converts a Web-standard Request to an internal TighRequest.
 * Automatically decodes and normalizes Unicode/Persian path and query parameters to NFC.
 */
export async function toTighRequest(request: globalThis.Request): Promise<TighRequest> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // NFC-decode Persian / Unicode path
  const path = pathname
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s).normalize('NFC');
      } catch {
        return s.normalize('NFC');
      }
    })
    .join('/');

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v.normalize('NFC');
  });

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let body: unknown = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const ct = headers['content-type'] || '';
    try {
      if (ct.includes('application/json')) {
        body = await request.clone().json();
      } else if (
        ct.includes('application/x-www-form-urlencoded') ||
        ct.includes('multipart/form-data')
      ) {
        const fd = await request.clone().formData();
        const obj: Record<string, unknown> = {};
        fd.forEach((v, k) => {
          obj[k] = v;
        });
        body = obj;
      } else {
        const text = await request.clone().text();
        body = text.length > 0 ? text : undefined;
      }
    } catch {
      body = undefined;
    }
  }

  const clientIp =
    headers['cf-connecting-ip'] ||
    (headers['x-forwarded-for'] ? headers['x-forwarded-for'].split(',')[0]?.trim() : undefined) ||
    headers['x-real-ip'] ||
    'anonymous';

  return {
    method: request.method as HttpMethod,
    path: normalizePath(path),
    url: request.url,
    headers,
    query,
    params: {},
    body,
    ip: clientIp,
    timestamp: Date.now(),
  };
}

/**
 * TighEngine: High-performance, zero-dependency, multi-runtime TypeScript API Engine.
 */
export class TighEngine implements Engine {
  readonly router: TighRadixRouter;
  readonly cache: PrebuiltCache;
  readonly rateLimiter: TighGcraRateLimiter;
  readonly circuitBreaker: TighCircuitBreaker;
  readonly metrics: TighMetrics;
  private readonly config: EngineConfig;

  private routeDefs: Map<string, EngineRoute> = new Map(); // key: "METHOD path"
  private middlewares: MiddlewareFn[] = [];

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache },
      rateLimit: { ...DEFAULT_CONFIG.rateLimit, ...config.rateLimit },
      circuitBreaker: { ...DEFAULT_CONFIG.circuitBreaker, ...config.circuitBreaker },
      cors: { ...DEFAULT_CONFIG.cors, ...config.cors },
    };
    this.router = new TighRadixRouter();
    this.cache = new PrebuiltCache(this.config.cache);
    this.rateLimiter = new TighGcraRateLimiter(this.config.rateLimit);
    this.circuitBreaker = new TighCircuitBreaker(this.config.circuitBreaker);
    this.metrics = new TighMetrics();
  }

  private routeKey(method: HttpMethod, path: string): string {
    return `${method} ${normalizePath(path)}`;
  }

  route(definition: EngineRoute): Engine {
    const normalizedPath = normalizePath(definition.path);
    const def: EngineRoute = {
      ...definition,
      path: normalizedPath,
    };
    this.router.addRoute(def.method, def.path, def.handler, []);
    this.routeDefs.set(this.routeKey(def.method, def.path), def);
    return this;
  }

  get(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('GET', path, handler, middlewaresOrOptions, options);
  }
  post(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('POST', path, handler, middlewaresOrOptions, options);
  }
  put(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('PUT', path, handler, middlewaresOrOptions, options);
  }
  delete(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('DELETE', path, handler, middlewaresOrOptions, options);
  }
  patch(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('PATCH', path, handler, middlewaresOrOptions, options);
  }
  options(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('OPTIONS', path, handler, middlewaresOrOptions, options);
  }
  head(
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    return this.register('HEAD', path, handler, middlewaresOrOptions, options);
  }

  private register(
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
    middlewaresOrOptions?: MiddlewareFn[] | Partial<EngineRoute>,
    options?: Partial<EngineRoute>
  ): Engine {
    let middlewares: MiddlewareFn[] | undefined;
    let opts: Partial<EngineRoute> | undefined;

    if (Array.isArray(middlewaresOrOptions)) {
      middlewares = middlewaresOrOptions;
      opts = options;
    } else {
      opts = middlewaresOrOptions;
      middlewares = opts?.middlewares;
    }

    const def: EngineRoute = {
      method,
      path,
      handler,
      middlewares,
      cache: opts?.cache,
      rateLimit: opts?.rateLimit,
    };
    return this.route(def);
  }

  use(middleware: MiddlewareFn): Engine {
    this.middlewares.push(middleware);
    return this;
  }

  group(prefix: string, callback: (router: Engine) => void): Engine {
    const normalizedPrefix = normalizePath(prefix);
    const subEngine: Engine = {
      route: (def: EngineRoute) => {
        const fullPath = normalizePath(`${normalizedPrefix}/${def.path.replace(/^\//, '')}`);
        return this.route({ ...def, path: fullPath });
      },
      get: (path, handler, arg3, arg4) =>
        this.get(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      post: (path, handler, arg3, arg4) =>
        this.post(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      put: (path, handler, arg3, arg4) =>
        this.put(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      delete: (path, handler, arg3, arg4) =>
        this.delete(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      patch: (path, handler, arg3, arg4) =>
        this.patch(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      options: (path, handler, arg3, arg4) =>
        this.options(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      head: (path, handler, arg3, arg4) =>
        this.head(normalizePath(`${normalizedPrefix}/${path.replace(/^\//, '')}`), handler, arg3 as any, arg4),
      use: (mw) => {
        // Scoped middleware for this prefix
        this.use(async (req, next) => {
          if (req.path.startsWith(normalizedPrefix)) {
            return mw(req, next);
          }
          return next();
        });
        return subEngine;
      },
      group: (subPrefix, subCb) =>
        this.group(normalizePath(`${normalizedPrefix}/${subPrefix.replace(/^\//, '')}`), subCb),
      handle: (m, p, r) => this.handle(m, p, r),
      flushMetrics: () => this.flushMetrics(),
      invalidateCache: (p) => this.invalidateCache(p),
      destroy: () => this.destroy(),
      fetch: (r) => this.fetch(r),
    };

    callback(subEngine);
    return this;
  }

  private getCorsHeaders(): Record<string, string> {
    const c = this.config.cors;
    const origin = Array.isArray(c.origin) ? c.origin.join(', ') : c.origin;
    const headers: Record<string, string> = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': c.methods.join(', '),
      'access-control-allow-headers': c.headers.join(', '),
      'access-control-max-age': String(c.maxAge),
    };
    if (c.credentials) {
      headers['access-control-allow-credentials'] = 'true';
    }
    return headers;
  }

  private async executeRouteChain(
    def: EngineRoute,
    req: TighRequest
  ): Promise<TighResponse> {
    const middlewares: MiddlewareFn[] = [
      ...this.middlewares,
      ...(def.middlewares || []),
    ];

    // Metrics tracking middleware
    if (this.config.enableMetrics) {
      middlewares.push(async (r, next) => {
        const started = performance.now();
        try {
          const response = await next();
          this.metrics.recordRequest(
            r.method,
            def.path,
            response.status,
            performance.now() - started
          );
          return response;
        } catch (error) {
          this.metrics.recordRequest(
            r.method,
            def.path,
            500,
            performance.now() - started
          );
          throw error;
        }
      });
    }

    // Prebuilt Cache with Single-Flight request coalescing
    if (this.config.enableCache && def.cache) {
      const cacheConfig = def.cache;
      const cacheKey = cacheConfig.key
        ? cacheConfig.key(req)
        : `${req.method}:${req.path}?${sortQuery(req.query)}`;

      const cc = req.headers['cache-control'] || '';
      const bypass =
        parseBool(req.query.random) ||
        cc.includes('no-cache') ||
        cc.includes('no-store') ||
        (cacheConfig.shouldCache && !cacheConfig.shouldCache(req));

      middlewares.push(async (r, next) => {
        if (bypass) return next();

        const cached = this.cache.get(cacheKey);
        if (cached) {
          const response = jsonBody(
            new TextDecoder().decode(cached),
            200,
            { 'x-cache': 'HIT' }
          );
          return {
            ...response,
            body: cached,
          };
        }

        const response = await next();
        if (response.status >= 200 && response.status < 300 && response.body !== null) {
          const bytes = response.body;
          await withSingleFlight(
            this.cache,
            cacheKey,
            () => Promise.resolve(bytes),
            cacheConfig.ttl
          );
        }
        return {
          ...response,
          headers: { ...response.headers, 'x-cache': 'MISS' },
        };
      });
    }

    // Circuit breaker around actual route handler
    const wrappedHandler: RouteHandler = async (r: TighRequest): Promise<TighResponse> => {
      if (this.config.enableCircuitBreaker) {
        return this.circuitBreaker.execute(() => def.handler(r));
      }
      return def.handler(r);
    };

    middlewares.push(async (r) => wrappedHandler(r));

    let index = 0;
    const next: NextFn = async (): Promise<TighResponse> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++]!;
        return mw(req, next);
      }
      return emptyBody(204);
    };

    return next();
  }

  async handle(method: HttpMethod, path: string, req: TighRequest): Promise<TighResponse> {
    const corsHeaders = this.getCorsHeaders();
    const normalized = normalizePath(path);
    req.path = normalized;

    // Rate limiter check
    let rateHeaders: Record<string, string> = {};
    if (this.config.enableRateLimit) {
      const rateResult = this.rateLimiter.check(req);
      rateHeaders = this.rateLimiter.headers(rateResult);
      if (!rateResult.allowed) {
        if (this.config.enableMetrics) {
          this.metrics.recordRequest(method, normalized, 429, 0);
        }
        return jsonBody(
          { error: 'Too Many Requests', message: 'Rate limit exceeded' },
          429,
          { ...corsHeaders, ...rateHeaders }
        );
      }
    }

    // Fast-path OPTIONS handling for CORS preflight
    if (method === 'OPTIONS') {
      return {
        ...emptyBody(204),
        headers: { ...corsHeaders, ...rateHeaders },
      };
    }

    // HEAD requests match GET routes
    const matchMethod = method === 'HEAD' ? 'GET' : method;
    const match = this.router.match(matchMethod, normalized);

    if (!match) {
      const res = problemResponse(
        404,
        'Not Found',
        `No route found for ${method} ${normalized}`,
        this.config.problemBaseUrl || 'about:blank'
      );
      if (this.config.enableMetrics) {
        this.metrics.recordRequest(method, normalized, 404, 0);
      }
      return { ...res, headers: { ...res.headers, ...corsHeaders, ...rateHeaders } };
    }

    req.params = match.params;
    const def = this.routeDefs.get(this.routeKey(match.route.method, match.route.path))!;

    let response: TighResponse;
    try {
      response = await this.executeRouteChain(def, req);
    } catch (error) {
      const err = error as Error;
      if (err instanceof CircuitOpenError) {
        response = jsonBody(
          {
            error: 'Service Unavailable',
            message: 'Circuit breaker is open. Please retry later.',
          },
          503,
          { 'retry-after': String(err.retryAfter) }
        );
      } else {
        response = problemResponse(
          500,
          'Internal Server Error',
          err.message || 'Unknown server error',
          this.config.problemBaseUrl || 'about:blank'
        );
      }
    }

    // HEAD requests return response headers with null body
    if (method === 'HEAD') {
      response = { ...response, body: null };
    }

    if (parseBool(req.query.random)) {
      response = {
        ...response,
        headers: { ...response.headers, 'cache-control': 'no-store' },
      };
    }

    // Conditional HTTP Revalidation: 304 Not Modified
    const inm = req.headers['if-none-match'];
    if (inm && response.headers.etag && inm === response.headers.etag) {
      response = {
        status: 304,
        headers: {
          etag: response.headers.etag,
          'cache-control': response.headers['cache-control'] ?? 'private, max-age=0',
        },
        body: null,
      };
    }

    return {
      ...response,
      headers: { ...corsHeaders, ...response.headers, ...rateHeaders },
    };
  }

  async fetch(request: globalThis.Request): Promise<globalThis.Response> {
    const ourReq = await toTighRequest(request);
    const res = await this.handle(ourReq.method, ourReq.path, ourReq);
    return toWebResponse(res);
  }

  flushMetrics(): MetricsSnapshot {
    this.metrics.updateCacheStats(
      this.cache.getStats().hits,
      this.cache.getStats().misses,
      this.cache.getStats().size,
      this.cache.getStats().memoryBytes
    );
    this.metrics.updateRateLimitStats(
      this.rateLimiter.getStats().totalRequests,
      this.rateLimiter.getStats().rejected,
      this.rateLimiter.getStats().byKey
    );
    this.metrics.updateCircuitBreakerStats(this.circuitBreaker.getStats());
    return this.metrics.snapshot();
  }

  invalidateCache(pattern: string): number {
    return this.cache.invalidatePattern(pattern);
  }

  destroy(): void {
    this.cache.destroy();
    this.rateLimiter.destroy();
    this.circuitBreaker.reset();
    this.routeDefs.clear();
    this.metrics.reset();
  }
}
