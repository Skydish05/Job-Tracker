// Minimal router so the server needs no npm dependencies.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
          keys.push(key);
          return '([^/]+)';
        }) +
        '/?$'
    );
    routes.push({ method, regex, keys, handler });
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new HttpError(413, 'Request body too large');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
  }

  // Returns true if a route matched (and the response was written).
  async function handle(req, res, url) {
    let pathMatched = false;
    for (const route of routes) {
      const m = route.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;

      const params = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const query = Object.fromEntries(url.searchParams);
      try {
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        const result = await route.handler({ req, params, query, body });
        if (result === undefined) {
          res.writeHead(204).end();
        } else {
          send(res, 200, result);
        }
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        if (status === 500) console.error(err);
        send(res, status, { error: err instanceof HttpError ? err.message : 'Internal server error' });
      }
      return true;
    }
    if (pathMatched) {
      send(res, 405, { error: 'Method not allowed' });
      return true;
    }
    return false;
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    handle,
  };
}

export function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
