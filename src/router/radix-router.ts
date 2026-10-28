import type {
  HttpMethod,
  Route,
  RouteHandler,
  MiddlewareFn,
  RouteParams,
  TighResponse,
  TighRequest,
} from '../types';

export type AnyRouteHandler = (req: any) => Promise<any> | any;
export type AnyMiddlewareFn = (req: any, next: any) => Promise<any> | any;

export interface RadixNode {
  path: string;
  route: Route | null;
  children: Map<string, RadixNode>;
  paramChild: RadixNode | null;
  paramName: string | null;
  wildcardChild: RadixNode | null;
}

function createNode(): RadixNode {
  return {
    path: '',
    route: null,
    children: new Map(),
    paramChild: null,
    paramName: null,
    wildcardChild: null,
  };
}

/**
 * Returns the length of the common prefix between strings a and b.
 */
function commonPrefixLen(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * Normalizes a path string: ensures leading slash, NFC normalizes,
 * removes consecutive slashes, and strips trailing slash (unless root '/').
 */
export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  let p = path.normalize('NFC');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

export class TighRadixRouter {
  private roots: Map<HttpMethod, RadixNode> = new Map();
  private notFoundHandler: AnyRouteHandler = () => ({
    status: 404,
    headers: { 'content-type': 'application/problem+json; charset=utf-8' },
    body: new TextEncoder().encode(
      JSON.stringify({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'Route not found',
      })
    ),
  });

  constructor() {
    const methods: HttpMethod[] = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ];
    for (const method of methods) {
      this.roots.set(method, createNode());
    }
  }

  /**
   * Registers a route for the given HTTP method and path pattern.
   * Path patterns can contain:
   * - Static segments: `/api/v1/quotes`
   * - Bracket params: `/quotes/[id]`
   * - Colon params: `/quotes/:id`
   * - Wildcards: `/static/*`
   */
  addRoute(
    method: HttpMethod,
    path: string,
    handler: AnyRouteHandler,
    middlewares: AnyMiddlewareFn[] = []
  ): void {
    const root = this.roots.get(method);
    if (!root) {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    const normalized = normalizePath(path);
    const segments = normalized.split('/').filter(Boolean);
    insertSegments(root, segments, 0, {
      method,
      path: normalized,
      handler: handler as RouteHandler,
      middlewares: middlewares as MiddlewareFn[],
    });
  }

  /**
   * Matches a request method and path against the compiled radix trie.
   * Returns the matched route and extracted parameters, or null.
   */
  match(method: HttpMethod, path: string): { route: Route; params: RouteParams } | null {
    const root = this.roots.get(method);
    if (!root) return null;

    const normalized = normalizePath(path);
    const params: RouteParams = {};
    const result = matchNode(root, normalized, 0, params);
    return result;
  }

  setNotFound(handler: AnyRouteHandler): void {
    this.notFoundHandler = handler;
  }

  getNotFoundHandler(): AnyRouteHandler {
    return this.notFoundHandler;
  }

  getRoutes(): Route[] {
    const routes: Route[] = [];
    for (const root of this.roots.values()) {
      collectRoutes(root, routes);
    }
    return routes;
  }
}

/* ------------------------------------------------------------------ */
/* Trie Insertion Implementation                                      */
/* ------------------------------------------------------------------ */

interface RouteDef {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
  middlewares: MiddlewareFn[];
}

function isParamSegment(seg: string): { isParam: boolean; name: string } {
  if (seg.length >= 3 && seg.startsWith('[') && seg.endsWith(']')) {
    return { isParam: true, name: seg.slice(1, -1) };
  }
  if (seg.length >= 2 && seg.startsWith(':')) {
    return { isParam: true, name: seg.slice(1) };
  }
  return { isParam: false, name: '' };
}

function insertSegments(
  node: RadixNode,
  segments: string[],
  index: number,
  def: RouteDef
): void {
  if (index === segments.length) {
    node.route = def;
    return;
  }

  const seg = segments[index]!;
  const paramInfo = isParamSegment(seg);

  // Parameter segment: [name] or :name
  if (paramInfo.isParam) {
    const paramName = paramInfo.name;
    if (!node.paramChild) {
      node.paramChild = createNode();
      node.paramName = paramName;
    }
    insertSegments(node.paramChild, segments, index + 1, def);
    return;
  }

  // Wildcard segment: *
  if (seg === '*' || seg.startsWith('*')) {
    if (!node.wildcardChild) {
      node.wildcardChild = createNode();
    }
    insertSegments(node.wildcardChild, segments, index + 1, def);
    return;
  }

  // Static segment: insert with radix edge compression & splitting
  insertStaticEdge(node, seg, segments, index + 1, def);
}

function insertStaticEdge(
  node: RadixNode,
  seg: string,
  segments: string[],
  nextIndex: number,
  def: RouteDef
): void {
  const first = seg[0]!;
  const child = node.children.get(first);

  if (!child) {
    const created = createNode();
    created.path = seg;
    node.children.set(first, created);
    insertSegments(created, segments, nextIndex, def);
    return;
  }

  const common = commonPrefixLen(seg, child.path);

  if (common === child.path.length) {
    if (common === seg.length) {
      insertSegments(child, segments, nextIndex, def);
    } else {
      const rest = seg.slice(common);
      const existingMid = child.children.get(rest[0]!);
      if (existingMid) {
        insertStaticEdge(child, rest, segments, nextIndex, def);
      } else {
        const mid = createNode();
        mid.path = rest;
        child.children.set(rest[0]!, mid);
        insertSegments(mid, segments, nextIndex, def);
      }
    }
    return;
  }

  if (common === seg.length) {
    const childRest = child.path.slice(common);
    const mid = createNode();
    mid.path = seg;
    node.children.set(first, mid);

    const newChild = createNode();
    newChild.path = childRest;
    newChild.route = child.route;
    newChild.children = child.children;
    newChild.paramChild = child.paramChild;
    newChild.paramName = child.paramName;
    newChild.wildcardChild = child.wildcardChild;
    mid.children.set(childRest[0]!, newChild);

    insertSegments(mid, segments, nextIndex, def);
    return;
  }

  // Partial overlap
  const mid = createNode();
  mid.path = seg.slice(0, common);
  node.children.set(first, mid);

  const existingRest = child.path.slice(common);
  const existingNode = createNode();
  existingNode.path = existingRest;
  existingNode.route = child.route;
  existingNode.children = child.children;
  existingNode.paramChild = child.paramChild;
  existingNode.paramName = child.paramName;
  existingNode.wildcardChild = child.wildcardChild;
  mid.children.set(existingRest[0]!, existingNode);

  const newRest = seg.slice(common);
  const newNode = createNode();
  newNode.path = newRest;
  mid.children.set(newRest[0]!, newNode);

  insertSegments(newNode, segments, nextIndex, def);
}

/* ------------------------------------------------------------------ */
/* Trie Matching Implementation                                       */
/* ------------------------------------------------------------------ */

function matchNode(
  node: RadixNode,
  path: string,
  pos: number,
  params: RouteParams
): { route: Route; params: RouteParams } | null {
  const edge = node.path;
  let j = 0;
  const max = Math.min(edge.length, path.length - pos);
  while (j < max && edge.charCodeAt(j) === path.charCodeAt(pos + j)) j++;
  if (j < edge.length) return null;

  pos += j;

  if (pos === path.length) {
    return node.route ? { route: node.route, params: { ...params } } : null;
  }

  if (path.charCodeAt(pos) === 0x2f) {
    pos++;
    if (pos === path.length) {
      return node.route ? { route: node.route, params: { ...params } } : null;
    }

    let segEnd = pos;
    while (segEnd < path.length && path.charCodeAt(segEnd) !== 0x2f) segEnd++;
    const segment = path.slice(pos, segEnd);

    // 1. Exact static child
    const char = path[pos]!;
    const exact = node.children.get(char);
    if (exact) {
      const result = matchNode(exact, path, pos, params);
      if (result) return result;
    }

    // 2. Dynamic parameter child
    if (node.paramChild) {
      const pName = node.paramName || 'param';
      params[pName] = segment;
      const nextPos = segEnd === path.length ? segEnd : segEnd;
      const result = matchNode(node.paramChild, path, nextPos, params);
      if (result) return result;
      delete params[pName];
    }

    // 3. Wildcard child
    if (node.wildcardChild) {
      params['*'] = path.slice(pos);
      if (node.wildcardChild.route) {
        return { route: node.wildcardChild.route, params: { ...params } };
      }
      const result = matchNode(node.wildcardChild, path, segEnd, params);
      if (result) return result;
    }

    return null;
  }

  // Mid-segment continuation
  const char = path[pos];
  if (char) {
    const child = node.children.get(char);
    if (child && path.startsWith(child.path, pos)) {
      return matchNode(child, path, pos, params);
    }
  }

  return null;
}

function collectRoutes(node: RadixNode, routes: Route[]): void {
  if (node.route) routes.push(node.route);
  for (const child of node.children.values()) collectRoutes(child, routes);
  if (node.paramChild) collectRoutes(node.paramChild, routes);
  if (node.wildcardChild) collectRoutes(node.wildcardChild, routes);
}
