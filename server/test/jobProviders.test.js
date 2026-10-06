import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, normalizeRemotiveJob, safeJobUrl, stripHtml } from '../services/jobProviders.js';

const now = Date.parse('2026-10-05T00:00:00Z');
const provider = (id) => PROVIDERS.find((item) => item.id === id);
const response = (body) => ({ ok: true, json: async () => body });
const remotive = (extra = {}) => ({ id: 7, title: 'Developer', company_name: 'Acme', url: 'https://remotive.com/jobs/7', ...extra });
const arbeitnow = (slug = 'engineer', extra = {}) => ({ slug, title: 'Engineer', company_name: 'Acme', url: `https://www.arbeitnow.com/jobs/${slug}`, ...extra });

test('Remotive uses the complete feed and preserves attribution and namespaced IDs', async () => {
  const jobs = await provider('remotive').fetchJobs({ now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://remotive.com/api/remote-jobs');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    return response({ jobs: [remotive({ tags: ['React', 'REACT', null, {}], description: '<p>Hello&nbsp;<b>world</b></p>', publication_date: '2026-10-04T12:00:00' })] });
  } });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'remotive:7');
  assert.deepEqual(jobs[0].tags, ['react']);
  assert.equal(jobs[0].sourceName, 'Remotive');
  assert.equal(jobs[0].sourceUrl, jobs[0].url);
  assert.equal(jobs[0].verification, 'listed');
  assert.equal(jobs[0].discoveredAt, '2026-10-05T00:00:00.000Z');
  assert.equal(jobs[0].description, 'Hello world');
  assert.equal(jobs[0].postedAt, '2026-10-04T12:00:00.000Z');
  assert.equal(jobs[0].remote, true);
});

test('explicitly closed or expired jobs are excluded while missing expiry is allowed', () => {
  for (const extra of [{ closed: true }, { expired: 'true' }, { active: false }, { status: 'FILLED' }, { validThrough: '2026-10-04T23:59:00Z' }]) {
    assert.equal(normalizeRemotiveJob(remotive(extra), { now }), null);
  }
  assert.ok(normalizeRemotiveJob(remotive({ validThrough: '2026-10-06T00:00:00Z' }), { now }));
  assert.ok(normalizeRemotiveJob(remotive({ validThrough: 'unknown', expired: false }), { now }));
  assert.equal(normalizeRemotiveJob(null), null);
  assert.equal(normalizeRemotiveJob(remotive({ id: {} })), null);
  assert.equal(normalizeRemotiveJob(remotive({ title: '' })), null);
});

test('unsafe posting links and HTML scripts are discarded', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/jobs', 'http://user:password@example.com', 'http://localhost:3000', 'http://foo.localhost', 'http://127.1', 'http://[::1]', 'http://10.0.0.1', 'http://192.168.1.1']) {
    assert.equal(safeJobUrl(url), '');
    assert.equal(normalizeRemotiveJob(remotive({ url })), null);
  }
  assert.equal(safeJobUrl('https://example.com/jobs/1'), 'https://example.com/jobs/1');
  assert.equal(stripHtml('<script>doBadThing()</script><p>Dev &#x26; QA &#39;team&#39;</p>'), "Dev & QA 'team'");
  assert.equal(stripHtml('&#999999999999999999;'), '');
});

test('Arbeitnow follows official pagination and normalizes epoch dates, remote and job types', async () => {
  const urls = [];
  const jobs = await provider('arbeitnow').fetchJobs({ now, fetchImpl: async (url) => {
    urls.push(url);
    return response(urls.length === 1 ? {
      data: [arbeitnow('first', { created_at: 1791158400, remote: true, location: 'Berlin', tags: ['IT'], job_types: ['Full-time'] })],
      links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' },
    } : { data: [arbeitnow('second')], links: { next: null } });
  } });
  assert.equal(urls.length, 2);
  assert.equal(urls[1], 'https://www.arbeitnow.com/api/job-board-api?page=2');
  assert.equal(jobs[0].id, 'arbeitnow:first');
  assert.equal(jobs[0].postedAt, '2026-10-05T00:00:00.000Z');
  assert.equal(jobs[0].location, 'Berlin · Remote');
  assert.deepEqual(jobs[0].tags, ['it', 'remote']);
  assert.equal(jobs[0].jobType, 'Full-time');
});

test('Arbeitnow never fetches off-origin or non-feed pagination and exposes partial failures', async () => {
  for (const next of ['https://evil.example/api/job-board-api?page=2', 'https://www.arbeitnow.com/admin?page=2', 'http://www.arbeitnow.com/api/job-board-api?page=2', 'https://user@www.arbeitnow.com/api/job-board-api?page=2']) {
    let calls = 0;
    await assert.rejects(provider('arbeitnow').fetchJobs({ now, fetchImpl: async () => {
      calls++;
      return response({ data: [arbeitnow()], links: { next } });
    } }), (error) => error.partialJobs.length === 1 && /pagination URL/.test(error.message));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(provider('arbeitnow').fetchJobs({ now, fetchImpl: async () => {
    if (++calls > 1) throw new Error('network unavailable');
    return response({ data: [arbeitnow()], links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' } });
  } }), (error) => error.partialJobs.length === 1 && /page 2 failed/.test(error.message));
});

test('Arbeitnow caps pagination at five pages and rejects loops', async () => {
  let calls = 0;
  const jobs = await provider('arbeitnow').fetchJobs({ now, fetchImpl: async () => {
    calls++;
    return response({ data: [arbeitnow(`job-${calls}`)], links: { next: `https://www.arbeitnow.com/api/job-board-api?page=${calls + 1}` } });
  } });
  assert.equal(calls, 5);
  assert.equal(jobs.length, 5);
  await assert.rejects(provider('arbeitnow').fetchJobs({ now, fetchImpl: async () => response({
    data: [arbeitnow()], links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' },
  }) }), /repeated a page/);
});

test('Remote OK skips metadata and retains the original attribution link', async () => {
  const jobs = await provider('remoteok').fetchJobs({ now, fetchImpl: async () => response([
    { last_updated: 1791158400, legal: 'Credit Remote OK' },
    { id: '4', position: 'Developer', company: 'Acme', url: 'https://remoteOK.com/remote-jobs/4', apply_url: 'https://employer.example/apply', tags: ['JavaScript'], date: '2026-10-04T00:00:00Z', salary_min: 50000, salary_max: 80000 },
    { id: '5', position: 'Expired developer', url: 'https://remoteok.com/jobs/5', expired: true },
  ]) });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'remoteok:4');
  assert.equal(jobs[0].sourceName, 'Remote OK');
  assert.equal(jobs[0].url, 'https://remoteok.com/remote-jobs/4');
  assert.equal(jobs[0].salary, '50000 – 80000');
});

test('valid empty feeds stay empty; HTTP, network and malformed responses fail', async () => {
  for (const item of PROVIDERS) {
    const empty = item.id === 'remotive' ? { jobs: [] } : item.id === 'arbeitnow' ? { data: [] } : [];
    assert.deepEqual(await item.fetchJobs({ fetchImpl: async () => response(empty) }), []);
    await assert.rejects(item.fetchJobs({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
    await assert.rejects(item.fetchJobs({ fetchImpl: async () => response(null) }), /Unexpected/);
    await assert.rejects(item.fetchJobs({ fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
  }
});
