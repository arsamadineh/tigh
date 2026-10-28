import type {
  EngineConfig,
  LegacyEngineRoute as EngineRoute,
  HttpMethod,
  LegacyMiddlewareFn as MiddlewareFn,
  Request,
  Response,
  LegacyNextFn as NextFn,
  CacheConfig,
  RateLimitConfig,
} from './types';
import { TighRouter } from './router';
import { TighCache } from './cache';
import { TighMiddleware, corsMiddleware, timingMiddleware } from './middleware';
import { TighRateLimiter } from './rate-limiter';
import { TighCircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { TighMetrics } from './metrics';
import {
  TighEngine,
  jsonBody,
  textBody,
  emptyBody,
  problemResponse,
  toWebResponse,
  toTighRequest,
  simpleHash,
} from './server';

export {
  TighEngine,
  jsonBody,
  textBody,
  emptyBody,
  problemResponse,
  toWebResponse,
  toTighRequest,
  simpleHash,
};

const DEFAULT_CONFIG: EngineConfig = {
  cache: { maxSize: 10000, defaultTTL: 60000, checkInterval: 30000 },
  rateLimit: { windowMs: 60000, maxRequests: 100, strategy: 'token-bucket' },
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 86400,
  },
};

/**
 * Tigh v0 Engine class preserved for full backward compatibility.
 * Enhanced with modern radix routing, S3-FIFO caching, and Web Fetch API compatibility.
 */
export class Tigh {
  readonly router: TighRouter;
  readonly cache: TighCache;
  readonly middleware: TighMiddleware;
  readonly rateLimiter: TighRateLimiter;
  readonly circuitBreaker: TighCircuitBreaker;
  readonly metrics: TighMetrics;
  private config: EngineConfig;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache },
      rateLimit: { ...DEFAULT_CONFIG.rateLimit, ...config.rateLimit },
      circuitBreaker: { ...DEFAULT_CONFIG.circuitBreaker, ...config.circuitBreaker },
      cors: { ...DEFAULT_CONFIG.cors, ...config.cors },
    };

    this.router = new TighRouter();
    this.cache = new TighCache(this.config.cache as CacheConfig);
    this.middleware = new TighMiddleware();
    this.rateLimiter = new TighRateLimiter(this.config.rateLimit as RateLimitConfig);
    this.circuitBreaker = new TighCircuitBreaker(this.config.circuitBreaker);
    this.metrics = new TighMetrics();

    this.setupBaseMiddleware();
  }

  private setupBaseMiddleware(): void {
    this.middleware.use(corsMiddleware(this.config.cors));
    this.middleware.use(timingMiddleware());
  }

  route(definition: EngineRoute): Tigh {
    const method = definition.method;
    const middlewares: MiddlewareFn[] = [];

    if (this.config.enableMetrics) {
      middlewares.push(async (req, next) => {
        const started = performance.now();
        try {
          const response = await next();
          this.metrics.recordRequest(
            req.method,
            definition.path,
            response.status,
            performance.now() - started
          );
          return response;
        } catch (error) {
          this.metrics.recordRequest(
            req.method,
            definition.path,
            500,
            performance.now() - started
          );
          throw error;
        }
      });
    }

    middlewares.push(...(definition.middlewares || []));

    if (this.config.enableCache && definition.cache) {
      middlewares.push(this.createCacheMiddleware(definition));
    }

    const wrappedHandler: MiddlewareFn = async (req: Request, _next: NextFn) => {
      let response: Response;

      if (this.config.enableCircuitBreaker) {
        try {
          response = await this.circuitBreaker.execute(() =>
            Promise.resolve(definition.handler(req))
          );
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            response = {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(error.retryAfter),
              },
              body: {
                error: 'Service Unavailable',
                message: 'Circuit breaker is open. Please retry later.',
              },
            };
          } else {
            throw error;
          }
        }
      } else {
        response = await definition.handler(req);
      }

      return response;
    };

    middlewares.push(wrappedHandler);
    this.router.addRoute(
      method,
      definition.path,
      () => ({ status: 200, headers: {}, body: null }),
      middlewares
    );

    return this;
  }

  get(path: string, handler: EngineRoute['handler'], options?: Partial<EngineRoute>): Tigh {
    return this.route({ method: 'GET', path, handler, ...options });
  }

  post(path: string, handler: EngineRoute['handler'], options?: Partial<EngineRoute>): Tigh {
    return this.route({ method: 'POST', path, handler, ...options });
  }

  put(path: string, handler: EngineRoute['handler'], options?: Partial<EngineRoute>): Tigh {
    return this.route({ method: 'PUT', path, handler, ...options });
  }

  delete(path: string, handler: EngineRoute['handler'], options?: Partial<EngineRoute>): Tigh {
    return this.route({ method: 'DELETE', path, handler, ...options });
  }

  options(path: string, handler: EngineRoute['handler'], options?: Partial<EngineRoute>): Tigh {
    return this.route({ method: 'OPTIONS', path, handler, ...options });
  }

  private createCacheMiddleware(definition: EngineRoute): MiddlewareFn {
    return async (req: Request, next: NextFn) => {
      const cacheKey = definition.cache?.key
        ? definition.cache.key(req)
        : `cache:${req.method}:${req.path}:${JSON.stringify(req.query)}`;

      if (req.query.random === 'true' || !cacheKey) return next();

      const cached = this.cache.get<Response>(cacheKey);
      if (cached) {
        return { ...cached, headers: { ...cached.headers, 'X-Cache': 'HIT' } };
      }

      const response = await next();
      if (response.status >= 200 && response.status < 300) {
        this.cache.set(cacheKey, response, definition.cache?.ttl);
      }

      return { ...response, headers: { ...response.headers, 'X-Cache': 'MISS' } };
    };
  }

  async handle(method: HttpMethod, path: string, req: Request): Promise<Response> {
    const requestStarted = performance.now();
    if (this.config.enableRateLimit) {
      const rateResult = this.rateLimiter.check(req);
      if (!rateResult.allowed) {
        if (this.config.enableMetrics) {
          this.metrics.recordRequest(
            method,
            path,
            429,
            performance.now() - requestStarted
          );
        }
        return {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(rateResult.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateResult.resetAt),
            'Retry-After': String(rateResult.retryAfter || 60),
          },
          body: { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        };
      }
    }

    if (method === 'OPTIONS') {
      const response = await this.middleware.execute(req, async () => ({
        status: 204,
        headers: {},
        body: null,
      }));
      if (this.config.enableMetrics) {
        this.metrics.recordRequest(
          method,
          path,
          response.status,
          performance.now() - requestStarted
        );
      }
      return response;
    }

    const match = this.router.match(method, path);
    if (!match) {
      const response = await (this.router.getNotFoundHandler() as any)(req);
      if (this.config.enableMetrics) {
        this.metrics.recordRequest(
          method,
          path,
          response.status,
          performance.now() - requestStarted
        );
      }
      return response;
    }

    req.params = match.params;

    const routeMiddlewares = (match.route.middlewares || []) as MiddlewareFn[];
    const runRouteChain: NextFn = async (): Promise<Response> => {
      let index = 0;
      const next: NextFn = async (): Promise<Response> => {
        if (index < routeMiddlewares.length) {
          const mw = routeMiddlewares[index++]!;
          return mw(req, next);
        }
        return (match.route.handler as any)(req);
      };
      return next();
    };

    const response = await this.middleware.execute(req, runRouteChain);
    if (req.query.random === 'true') {
      return {
        ...response,
        headers: { ...response.headers, 'Cache-Control': 'no-store' },
      };
    }
    return response;
  }

  async fetch(request: globalThis.Request): Promise<globalThis.Response> {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    let body: unknown = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const ct = headers['content-type'] || '';
        if (ct.includes('application/json')) {
          body = await request.clone().json();
        } else {
          body = await request.clone().text();
        }
      } catch {
        body = undefined;
      }
    }

    const req: Request = {
      method: request.method as HttpMethod,
      path: url.pathname,
      url: request.url,
      headers,
      query,
      params: {},
      body,
      ip: headers['x-forwarded-for'] || headers['x-real-ip'] || 'anonymous',
      timestamp: Date.now(),
    };

    const res = await this.handle(req.method, req.path, req);

    let bodyInit: BodyInit | null = null;
    if (res.body !== null && res.body !== undefined) {
      if (typeof res.body === 'string') {
        bodyInit = res.body;
      } else if (res.body instanceof Uint8Array) {
        bodyInit = res.body as unknown as BodyInit;
      } else {
        bodyInit = JSON.stringify(res.body);
      }
    }

    return new globalThis.Response(bodyInit, {
      status: res.status,
      headers: res.headers,
    });
  }

  use(middleware: MiddlewareFn): Tigh {
    this.middleware.add(middleware);
    return this;
  }

  flushMetrics(): ReturnType<TighMetrics['snapshot']> {
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
    const cbStats = this.circuitBreaker.getStats();
    this.metrics.updateCircuitBreakerStats(cbStats);
    return this.metrics.snapshot();
  }

  invalidateCache(pattern: string): number {
    return this.cache.invalidatePattern(pattern);
  }

  destroy(): void {
    this.cache.destroy();
    this.rateLimiter.destroy();
    this.circuitBreaker.reset();
    this.metrics.reset();
  }
}
