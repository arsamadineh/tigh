import type { Engine } from '../types';

/**
 * Creates a fetch handler for Cloudflare Workers.
 *
 * Usage:
 * ```ts
 * import { TighEngine } from 'tigh';
 * import { createCloudflareHandler } from 'tigh/adapters/cloudflare';
 *
 * const engine = new TighEngine();
 * export default {
 *   fetch: createCloudflareHandler(engine),
 * };
 * ```
 */
export function createCloudflareHandler(engine: Engine) {
  return async (request: globalThis.Request): Promise<globalThis.Response> => {
    return engine.fetch(request);
  };
}
