import type { Engine } from '../types';

/**
 * Creates a request handler for Bun.serve.
 *
 * Usage:
 * ```ts
 * import { TighEngine } from 'tigh';
 * import { createBunHandler } from 'tigh/adapters/bun';
 *
 * const engine = new TighEngine();
 * Bun.serve({
 *   fetch: createBunHandler(engine),
 *   port: 3000,
 * });
 * ```
 */
export function createBunHandler(engine: Engine) {
  return (request: globalThis.Request): Promise<globalThis.Response> => engine.fetch(request);
}
