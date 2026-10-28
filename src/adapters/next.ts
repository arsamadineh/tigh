import type { Engine } from '../types';

/**
 * Creates route handlers for Next.js App Router route files (route.ts).
 *
 * Usage:
 * ```ts
 * import { TighEngine } from 'tigh';
 * import { createNextHandler } from 'tigh/adapters/next';
 *
 * const engine = new TighEngine();
 * export const GET = createNextHandler(engine);
 * export const POST = createNextHandler(engine);
 * export const OPTIONS = createNextHandler(engine);
 * ```
 */
export function createNextHandler(engine: Engine) {
  return async (
    req: globalThis.Request,
    _ctx?: { params?: Promise<Record<string, string>> | Record<string, string> }
  ): Promise<globalThis.Response> => {
    return engine.fetch(req);
  };
}
