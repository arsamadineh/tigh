import { describe, test, expect } from 'bun:test';
import { PrebuiltCache, withSingleFlight, GhostLedger } from '../src/cache/prebuilt-cache';
import { TighCache } from '../src/cache';

describe('GhostLedger', () => {
  test('records and evicts keys when maxSize is exceeded', () => {
    const ledger = new GhostLedger(3);
    ledger.set('a', 1);
    ledger.set('b', 2);
    ledger.set('c', 3);
    expect(ledger.get('a')).toBe(1);

    ledger.set('d', 4);
    expect(ledger.get('a')).toBeUndefined();
    expect(ledger.get('d')).toBe(4);
    expect(ledger.size()).toBe(3);
  });

  test('deletes keys correctly', () => {
    const ledger = new GhostLedger(5);
    ledger.set('k1', 10);
    expect(ledger.get('k1')).toBe(10);
    ledger.delete('k1');
    expect(ledger.get('k1')).toBeUndefined();
    expect(ledger.size()).toBe(0);
  });
});

describe('PrebuiltCache', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);

  test('stores and retrieves pre-serialized Uint8Array fragments', () => {
    const cache = new PrebuiltCache({ maxSize: 100, defaultTTL: 10000 });
    cache.set('item:1', enc('{"name":"hafez"}'));

    const hit = cache.get('item:1');
    expect(hit).not.toBeNull();
    expect(dec(hit!)).toBe('{"name":"hafez"}');
    expect(cache.has('item:1')).toBe(true);
  });

  test('returns null and records miss for non-existent key', () => {
    const cache = new PrebuiltCache({ maxSize: 10 });
    expect(cache.get('does-not-exist')).toBeNull();
    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  test('expires entries according to TTL', async () => {
    const cache = new PrebuiltCache({ maxSize: 10, defaultTTL: 50 });
    cache.set('short-lived', enc('val'), 30);

    expect(cache.get('short-lived')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('short-lived')).toBeNull();
  });

  test('promotes items from probation to main on re-access', () => {
    // maxSize 8 -> inMax=2, probationMax=2, mainMax=4
    const cache = new PrebuiltCache({ maxSize: 8 });

    cache.set('a', enc('1'));
    cache.set('b', enc('2'));
    // inQueue has a, b. Adding c should push a into probation
    cache.set('c', enc('3'));

    // Accessing 'a' while in probation promotes it to main
    const hitA = cache.get('a');
    expect(hitA).not.toBeNull();

    // Adding more items: 'a' should survive because it's in main
    cache.set('d', enc('4'));
    cache.set('e', enc('5'));

    expect(cache.get('a')).not.toBeNull();
  });

  test('tracks memoryBytes and size accurately', () => {
    const cache = new PrebuiltCache({ maxSize: 100 });
    const bytes1 = enc('hello');
    const bytes2 = enc('world!');
    cache.set('k1', bytes1);
    cache.set('k2', bytes2);

    expect(cache.size()).toBe(2);
    expect(cache.memoryBytes()).toBe(bytes1.byteLength + bytes2.byteLength);
  });

  test('invalidates keys matching wildcard pattern', () => {
    const cache = new PrebuiltCache({ maxSize: 100 });
    cache.set('user:1:profile', enc('p1'));
    cache.set('user:2:profile', enc('p2'));
    cache.set('book:1:meta', enc('m1'));

    const count = cache.invalidatePattern('user:*');
    expect(count).toBe(2);
    expect(cache.get('user:1:profile')).toBeNull();
    expect(cache.get('user:2:profile')).toBeNull();
    expect(cache.get('book:1:meta')).not.toBeNull();
  });

  test('convenience JSON helpers serialize and deserialize cleanly', () => {
    const cache = new PrebuiltCache({ maxSize: 100 });
    cache.setJson('user:42', { name: 'Arsam', role: 'admin' });

    const obj = cache.getJson<{ name: string; role: string }>('user:42');
    expect(obj).not.toBeNull();
    expect(obj?.name).toBe('Arsam');
    expect(obj?.role).toBe('admin');
  });

  test('destroy() clears entries and timers', () => {
    const cache = new PrebuiltCache({ maxSize: 10, checkInterval: 100 });
    cache.set('x', enc('1'));
    cache.destroy();
    expect(cache.size()).toBe(0);
  });
});

describe('withSingleFlight', () => {
  test('coalesces concurrent requests into a single execution', async () => {
    const cache = new PrebuiltCache({ maxSize: 100 });
    let factoryCalls = 0;

    const expensiveFactory = async () => {
      factoryCalls++;
      await new Promise((r) => setTimeout(r, 20));
      return new TextEncoder().encode('expensive-result');
    };

    // 5 concurrent calls with the same key
    const results = await Promise.all([
      withSingleFlight(cache, 'heavy-key', expensiveFactory),
      withSingleFlight(cache, 'heavy-key', expensiveFactory),
      withSingleFlight(cache, 'heavy-key', expensiveFactory),
      withSingleFlight(cache, 'heavy-key', expensiveFactory),
      withSingleFlight(cache, 'heavy-key', expensiveFactory),
    ]);

    expect(factoryCalls).toBe(1);
    for (const res of results) {
      expect(new TextDecoder().decode(res)).toBe('expensive-result');
    }

    // Now cached: subsequent call gets cached value immediately
    const nextResult = await withSingleFlight(cache, 'heavy-key', expensiveFactory);
    expect(factoryCalls).toBe(1);
    expect(new TextDecoder().decode(nextResult)).toBe('expensive-result');
  });
});

describe('TighCache (v0 Backward Compatibility)', () => {
  test('stores and retrieves objects within TTL', () => {
    const cache = new TighCache({ maxSize: 10, defaultTTL: 1000 });
    cache.set('item1', { data: 'test' }, 500);

    const hit = cache.get<{ data: string }>('item1');
    expect(hit).toEqual({ data: 'test' });
  });

  test('evicts least recently used items when maxSize reached', () => {
    const cache = new TighCache({ maxSize: 2, defaultTTL: 5000 });
    cache.set('a', 1);
    cache.set('b', 2);
    // Touch 'a' to refresh in LRU
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('b')).toBeNull();
  });
});
