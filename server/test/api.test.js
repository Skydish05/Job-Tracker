import './setup.js'; // must stay first: points the DB at :memory: before db.js loads
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.js';
import { normalizeJob, stripHtml } from '../services/jobApiService.js';
import { jobRepository } from '../services/jobRepository.js';
import { db } from '../db/db.js';

let server;
let base;

before(async () => {
  // External services fail fast; the app must show an honest empty state.
  globalThis.fetch = async () => {
    throw new Error('network disabled in tests');
  };
  server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

// The global fetch is stubbed above, so talk to the server with node:http instead.
import http from 'node:http';
function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      base + path,
      { method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('applications CRUD lifecycle', async () => {
  let r = await call('POST', '/api/applications', { company: 'Acme', role: 'Dev', deadline: '2026-11-01' });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'applied');
  const id = r.json.id;

  r = await call('GET', '/api/applications');
  assert.equal(r.json.length, 1);

  r = await call('PUT', `/api/applications/${id}`, { status: 'interview', notes: 'Phone screen Tuesday' });
  assert.equal(r.json.status, 'interview');
  assert.equal(r.json.company, 'Acme');
  assert.equal(r.json.notes, 'Phone screen Tuesday');

  r = await call('GET', '/api/applications?status=offer');
  assert.equal(r.json.length, 0);
  r = await call('GET', '/api/applications?status=interview');
  assert.equal(r.json.length, 1);

  r = await call('DELETE', `/api/applications/${id}`);
  assert.equal(r.status, 204);
  r = await call('GET', `/api/applications/${id}`);
  assert.equal(r.status, 404);
});

test('saving the same posting link twice does not create a copy', async () => {
  const job = { company: 'Dup Co', role: 'Dev', status: 'wishlist', link: 'https://example.com/jobs/1' };
  const first = await call('POST', '/api/applications', job);
  assert.equal(first.status, 200);
  assert.equal(first.json.duplicate, undefined);

  const second = await call('POST', '/api/applications', job);
  assert.equal(second.status, 200);
  assert.equal(second.json.duplicate, true);
  assert.equal(second.json.id, first.json.id);

  const list = await call('GET', '/api/applications');
  assert.equal(list.json.filter((a) => a.link === job.link).length, 1);

  // Entries without a link are never treated as duplicates.
  const a = await call('POST', '/api/applications', { company: 'No Link', role: 'Dev' });
  const b = await call('POST', '/api/applications', { company: 'No Link', role: 'Dev' });
  assert.notEqual(a.json.id, b.json.id);

  for (const id of [first.json.id, a.json.id, b.json.id]) await call('DELETE', `/api/applications/${id}`);
});

test('applications validation', async () => {
  let r = await call('POST', '/api/applications', { company: '', role: 'Dev' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/applications', { company: 'A', role: 'B', status: 'hired' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/applications', { company: 'A', role: 'B', deadline: '11/01/2026' });
  assert.equal(r.status, 400);
  r = await call('PUT', '/api/applications/9999', { status: 'offer' });
  assert.equal(r.status, 404);
  r = await call('PATCH', '/api/applications', {});
  assert.equal(r.status, 405);
});

test('profile read and update', async () => {
  let r = await call('GET', '/api/profile');
  assert.equal(r.json.skills, '');
  r = await call('PUT', '/api/profile', {
    name: 'Min',
    skills: 'React, SQL, Python',
    target_roles: 'junior developer',
    experience: 'entry',
  });
  assert.equal(r.json.skills, 'React, SQL, Python');
  r = await call('PUT', '/api/profile', { experience: 'wizard' });
  assert.equal(r.status, 400);
});

test('job feed reports unavailable sources without substituting sample jobs', async () => {
  const r = await call('GET', '/api/jobs');
  assert.equal(r.status, 200);
  assert.equal(r.json.source, 'empty');
  assert.ok(r.json.warning);
  assert.deepEqual(r.json.jobs, []);
  assert.equal(r.json.sources.length, 3);
  assert.ok(r.json.sources.every((source) => source.status === 'error'));
  assert.equal(r.json.discovery.enabled, false);
});

test('job feed paginates beyond 50 and combines keyword, category, source and region filters', async () => {
  const jobs = Array.from({ length: 65 }, (_, i) => ({
    id: `remotive:${i}`, title: `React Developer ${i}`, company: `Company ${i}`,
    tags: ['react'], description: 'Build React interfaces', category: 'Software Development',
    location: i % 2 ? 'Seoul, South Korea' : 'Toronto, Canada', jobType: 'full_time', salary: '',
    url: `https://example.com/jobs/${i}`, postedAt: i === 64 ? '' : new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), remote: false,
    sourceId: 'remotive', sourceName: 'Remotive', sourceUrl: 'https://remotive.com',
    verification: 'listed', discoveredAt: '2026-01-02T00:00:00.000Z',
  }));
  jobRepository.writeSource('remotive', jobs, Date.now());
  jobRepository.writeSource('arbeitnow', [], Date.now());
  jobRepository.writeSource('remoteok', [], Date.now());
  try {
    const first = await call('GET', '/api/jobs?limit=50');
    const second = await call('GET', '/api/jobs?offset=50&limit=50');
    assert.equal(first.json.total, 65);
    assert.equal(first.json.jobs.length, 50);
    assert.equal(first.json.hasMore, true);
    assert.equal(second.json.jobs.length, 15);
    assert.equal(second.json.hasMore, false);
    assert.equal(new Set([...first.json.jobs, ...second.json.jobs].map((job) => job.id)).size, 65);
    const filtered = await call('GET', '/api/jobs?q=react&category=software-dev&region=seoul&source=remotive&limit=100');
    assert.equal(filtered.json.total, 32);
    assert.ok(filtered.json.jobs.every((job) => job.location.includes('Seoul')));
    const wrongCategory = await call('GET', '/api/jobs?q=react&category=design');
    assert.equal(wrongCategory.json.total, 0);
    assert.equal(first.json.jobs[0].id, 'remotive:64'); // Missing publication dates use discovery time.
    assert.equal(first.json.jobs[1].id, 'remotive:63');
    assert.ok(first.json.jobs.every((job) => !Object.hasOwn(job, 'match')));
    assert.equal(first.json.profileComplete, undefined);
    // Legacy score parameters no longer filter jobs out.
    assert.equal((await call('GET', '/api/jobs?min=100')).json.total, 65);
  } finally {
    db.exec('DELETE FROM job_source_cache');
  }
});

test('job search validates inputs and discovery requires configured services', async () => {
  for (const query of ['offset=-1', 'offset=1.5', 'limit=101', 'region=invalid', 'source=invalid', 'category=invalid']) {
    assert.equal((await call('GET', `/api/jobs?${query}`)).status, 400);
  }
  assert.equal((await call('POST', '/api/jobs/discover', { q: 'React', region: 'seoul' })).status, 503);
  assert.equal((await call('POST', '/api/jobs/discover', { q: 'React', region: 'invalid' })).status, 400);
  assert.equal((await call('POST', '/api/jobs/discover', { q: [] })).status, 400);
  assert.equal((await call('POST', '/api/jobs/discover', { q: 'React', target: 'unknown' })).status, 400);
  assert.equal((await call('POST', '/api/jobs/discover', { q: 'React', target: ['linkedin'] })).status, 400);
});

test('web discovery stores evidence-backed jobs, applies the selected region, and preserves them on failure', async () => {
  const originalFetch = globalThis.fetch;
  const content = 'Acme is hiring a Backend Engineer in Seoul, South Korea. Build production APIs using Node.js and SQL.';
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.TAVILY_API_KEY = 'test-search-key';
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('api.tavily.com')) {
      assert.match(JSON.parse(options.body).query, /Seoul/);
      assert.deepEqual(JSON.parse(options.body).include_domains, ['linkedin.com']);
      return new Response(JSON.stringify({ results: [{ title: 'Backend Engineer at Acme', url: 'https://kr.linkedin.com/jobs/view/backend-engineer-123456', content }] }));
    }
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ jobs: [{
        sourceIndex: 0, title: 'Backend Engineer', company: 'Acme', location: 'Seoul, South Korea',
        jobType: '', salary: '', tags: ['Node.js', 'SQL'], postedAt: '', deadline: '', evidence: content,
        isSingleJob: true, isOpen: true,
      }] }) }] } }] }));
    }
    throw new Error('Unexpected network request');
  };
  try {
    const result = await call('POST', '/api/jobs/discover', { q: 'Backend Engineer', region: 'seoul', target: 'linkedin' });
    assert.equal(result.status, 200);
    assert.equal(result.json.jobs.length, 1);
    assert.equal(result.json.jobs[0].verification, 'search-discovered');
    assert.equal(result.json.target, 'linkedin');
    assert.equal(result.json.jobs[0].platform, 'linkedin');
    const feed = await call('GET', '/api/jobs?region=seoul&source=web');
    assert.equal(feed.json.total, 1);
    assert.equal((await call('GET', '/api/jobs?region=seoul&source=linkedin')).json.total, 1);
    assert.equal((await call('GET', '/api/jobs?region=seoul&source=indeed')).json.total, 0);
    assert.equal((await call('GET', '/api/jobs?region=europe&source=web')).json.total, 0);
    globalThis.fetch = async () => { throw new Error('provider failed with secret diagnostic'); };
    const failure = await call('POST', '/api/jobs/discover', { q: 'new failed search', region: 'seoul' });
    assert.equal(failure.status, 502);
    assert.ok(!failure.text.includes('secret diagnostic'));
    assert.equal(jobRepository.readDiscoveries().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.TAVILY_API_KEY;
    db.exec('DELETE FROM discovered_jobs');
  }
});

test('cover letter falls back to a template without an API key', async () => {
  let r = await call('POST', '/api/cover-letter', { job: { title: 'Junior Developer', company: 'Acme' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.source, 'template');
  assert.match(r.json.text, /Junior Developer/);
  assert.match(r.json.text, /Acme/);
  assert.match(r.json.text, /React/);

  r = await call('POST', '/api/cover-letter', { job: { title: '' } });
  assert.equal(r.status, 400);
});

test('static client and unknown api routes', async () => {
  let r = await call('GET', '/api/nope');
  assert.equal(r.status, 404);
  r = await call('GET', '/../server/index.js');
  assert.notEqual(r.status, 200);
});

test('job normalisation strips html', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p><ul><li>A</li><li>B</li></ul>'), 'Hello world\nA\nB');
  const j = normalizeJob({
    id: 7,
    title: 'Dev',
    company_name: 'Co',
    tags: ['React'],
    description: '<p>x</p>',
    url: 'https://x',
  });
  assert.equal(j.id, '7');
  assert.deepEqual(j.tags, ['react']);
  assert.equal(j.company, 'Co');
});
