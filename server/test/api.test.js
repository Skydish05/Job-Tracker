import './setup.js'; // must stay first: points the DB at :memory: before db.js loads
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.js';
import { scoreJob, rankJobs } from '../services/rankingService.js';
import { normalizeJob, stripHtml } from '../services/jobApiService.js';

let server;
let base;

before(async () => {
  // Make the live job API fail fast so tests exercise the sample fallback.
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

test('job feed ranks by profile and falls back to sample data', async () => {
  const r = await call('GET', '/api/jobs');
  assert.equal(r.status, 200);
  assert.equal(r.json.source, 'sample');
  assert.ok(r.json.warning);
  assert.equal(r.json.profileComplete, true);
  const scores = r.json.jobs.map((j) => j.match.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  // Entry-level React/SQL profile should rank the junior full-stack job above the senior Java one.
  const titles = r.json.jobs.map((j) => j.title);
  assert.ok(titles.indexOf('Junior Full-Stack Developer') < titles.indexOf('Senior Backend Engineer'));

  const filtered = await call('GET', '/api/jobs?q=python');
  assert.ok(filtered.json.jobs.every((j) => /python/i.test(`${j.title} ${j.tags.join(' ')} ${j.description}`)));
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

test('ranking details', () => {
  const profile = { skills: 'c++, node.js, ci/cd', target_roles: 'backend engineer', experience: 'senior' };
  const job = {
    title: 'Backend Engineer',
    tags: ['node.js', 'ci/cd'],
    description: 'We use C++ and Node.js daily.',
    postedAt: '',
  };
  const m = scoreJob(job, profile);
  assert.deepEqual(m.matchedSkills.sort(), ['c++', 'ci/cd', 'node.js']);
  assert.deepEqual(m.matchedRoles, ['backend engineer']);
  assert.ok(m.score > 50 && m.score <= 100);

  // Empty profile scores everything 0 rather than dividing by zero.
  assert.equal(scoreJob(job, { skills: '', target_roles: '', experience: 'entry' }).score, 0);
  // "java" must not match inside "javascript".
  assert.deepEqual(
    scoreJob({ title: 'JavaScript Dev', tags: [], description: '', postedAt: '' }, { skills: 'java', target_roles: '', experience: 'mid' })
      .matchedSkills,
    []
  );
  assert.equal(rankJobs([], profile).length, 0);
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
