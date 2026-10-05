import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

import { createRouter, send } from './router.js';
import { registerApplications } from './routes/applications.js';
import { registerProfile } from './routes/profile.js';
import { registerJobs } from './routes/jobs.js';
import { registerCoverLetter } from './routes/coverLetter.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(here, '..', 'client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

export function createApp() {
  const router = createRouter();
  registerApplications(router);
  registerProfile(router);
  registerJobs(router);
  registerCoverLetter(router);

  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      const handled = await router.handle(req, res, url);
      if (!handled) send(res, 404, { error: 'Not found' });
      return;
    }

    // Static client files. Unknown paths fall back to index.html.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!rel) rel = 'index.html';
    let filePath = join(CLIENT_DIR, rel);
    if (filePath !== CLIENT_DIR && !filePath.startsWith(CLIENT_DIR + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      if (extname(rel)) {
        res.writeHead(404).end('Not found');
        return;
      }
      const index = await readFile(join(CLIENT_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(index);
    }
  });
}

// Start listening only when run directly (tests import createApp instead).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  // Loopback only: this is a single-user app with no login, so it should not
  // be reachable from other machines on the network.
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`Job Tracker running at http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) {
      console.log('Tip: set GEMINI_API_KEY to enable AI-written cover letters (template drafts otherwise).');
    }
  });
}
