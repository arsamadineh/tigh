import { describe, test, expect } from 'bun:test';
import { TighRadixRouter, normalizePath } from '../src/router/radix-router';
import { jsonBody } from '../src/server';

describe('TighRadixRouter', () => {
  test('matches exact static routes', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/api/quotes', () => jsonBody({ message: 'quotes' }));
    router.addRoute('GET', '/api/health', () => jsonBody({ status: 'ok' }));

    const match1 = router.match('GET', '/api/quotes');
    expect(match1).not.toBeNull();
    expect(match1?.route.path).toBe('/api/quotes');
    expect(match1?.params).toEqual({});

    const match2 = router.match('GET', '/api/health');
    expect(match2).not.toBeNull();
    expect(match2?.route.path).toBe('/api/health');
  });

  test('handles mid-segment edge splits correctly', () => {
    const router = new TighRadixRouter();
    // /user and /users share 'user' prefix
    router.addRoute('GET', '/user', () => jsonBody('single user'));
    router.addRoute('GET', '/users', () => jsonBody('all users'));
    router.addRoute('GET', '/users/profile', () => jsonBody('profile'));

    const mUser = router.match('GET', '/user');
    expect(mUser).not.toBeNull();
    expect(mUser?.route.path).toBe('/user');

    const mUsers = router.match('GET', '/users');
    expect(mUsers).not.toBeNull();
    expect(mUsers?.route.path).toBe('/users');

    const mProfile = router.match('GET', '/users/profile');
    expect(mProfile).not.toBeNull();
    expect(mProfile?.route.path).toBe('/users/profile');
  });

  test('handles reverse insertion order edge splits', () => {
    const router = new TighRadixRouter();
    // Longer edge inserted first
    router.addRoute('GET', '/categories', () => jsonBody('categories'));
    router.addRoute('GET', '/category', () => jsonBody('category'));

    expect(router.match('GET', '/categories')?.route.path).toBe('/categories');
    expect(router.match('GET', '/category')?.route.path).toBe('/category');
  });

  test('handles partial prefix overlap', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/cart', () => jsonBody('cart'));
    router.addRoute('GET', '/cats', () => jsonBody('cats'));

    expect(router.match('GET', '/cart')?.route.path).toBe('/cart');
    expect(router.match('GET', '/cats')?.route.path).toBe('/cats');
  });

  test('matches dynamic parameter routes with bracket syntax [param]', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/quotes/[poet]', () => jsonBody('poet'));

    const match = router.match('GET', '/quotes/hafez');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ poet: 'hafez' });
  });

  test('matches dynamic parameter routes with colon syntax :param', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/authors/:authorId/books/:bookId', () => jsonBody('book'));

    const match = router.match('GET', '/authors/ferdowsi/books/shahnameh');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({
      authorId: 'ferdowsi',
      bookId: 'shahnameh',
    });
  });

  test('matches wildcards at end of path', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/static/*', () => jsonBody('static asset'));

    const match = router.match('GET', '/static/css/theme/dark.css');
    expect(match).not.toBeNull();
    expect(match?.params['*']).toBe('css/theme/dark.css');
  });

  test('matches Persian and Unicode NFC paths seamlessly', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/شعر/:شاعر', () => jsonBody('persian poem'));

    const match = router.match('GET', '/شعر/حافظ');
    expect(match).not.toBeNull();
    expect(match?.params['شاعر']).toBe('حافظ');
  });

  test('handles root / route and trailing slashes', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/', () => jsonBody('root'));
    router.addRoute('GET', '/about', () => jsonBody('about'));

    expect(router.match('GET', '/')?.route.path).toBe('/');
    expect(router.match('GET', '/about/')?.route.path).toBe('/about');
    expect(router.match('GET', '/about')?.route.path).toBe('/about');
  });

  test('returns null for non-matching method or non-existent path', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/api/ping', () => jsonBody('pong'));

    expect(router.match('POST', '/api/ping')).toBeNull();
    expect(router.match('GET', '/api/pong')).toBeNull();
  });

  test('collects all registered routes via getRoutes()', () => {
    const router = new TighRadixRouter();
    router.addRoute('GET', '/a', () => jsonBody('a'));
    router.addRoute('POST', '/b', () => jsonBody('b'));
    router.addRoute('GET', '/c/:id', () => jsonBody('c'));

    const routes = router.getRoutes();
    expect(routes.length).toBe(3);
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /a');
    expect(paths).toContain('POST /b');
    expect(paths).toContain('GET /c/:id');
  });
});
