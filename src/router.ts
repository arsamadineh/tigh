import { TighRadixRouter } from './router/radix-router';
export { TighRadixRouter, normalizePath } from './router/radix-router';

/**
 * TighRouter: High-performance radix trie router.
 * Fully backward compatible with Tigh v0 API while utilizing
 * compiled compressed-edge radix routing internally.
 */
export class TighRouter extends TighRadixRouter {}
