import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobAggregator, deduplicateJobs, filterJobs } from '../services/jobApiService.js';
import { jobRepository, DISCOVERY_TTL_MS } from '../services/jobRepository.js';
import { db } from '../db/db.js';

const HOUR = 3_600_000;
const job = (overrides = {}) => ({ id: 'a:1', title: 'React Developer', company: 'Acme', category: 'Software Development',
  tags: ['react'], description: 'Build React interfaces', location: 'Seoul, South Korea', remote: false,
  url: 'https://example.com/jobs/1', sourceId: 'a', sourceName: 'A', postedAt: '2026-01-01', ...overrides });
function memoryRepository() {
  const data = new Map();
  return { data, readSource: (id) => data.get(id), writeSource: (id, jobs, fetchedAt) => data.set(id, { jobs, fetchedAt }), readDiscoveries: () => [] };
}
function provider(id, fetchJobs, ttlMs = HOUR) { return { id, name: id, url: `https://${id}.example.com`, fetchJobs, ttlMs }; }

test('independent providers run concurrently, deduplicate and survive a partial failure', async () => {
  const repository = memoryRepository();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started = 0;
  const aggregator = createJobAggregator({ repository, providers: [
    provider('a', async () => { started++; await gate; return [job()]; }),
    provider('b', async () => { started++; await gate; return [job({ id: 'b:1', sourceId: 'b', sourceName: 'B', url: 'https://other.example.com/job/2' })]; }),
    provider('c', async () => { started++; throw new Error('private diagnostic'); }),
  ] });
  const result = aggregator();
  await Promise.resolve();
  assert.equal(started, 3);
  release();
  const data = await result;
  assert.equal(data.jobs.length, 1);
  assert.equal(data.jobs[0].sources.length, 2);
  assert.equal(data.sources.find((source) => source.id === 'c').status, 'error');
  assert.equal(data.source, 'mixed');
  assert.ok(!JSON.stringify(data).includes('private diagnostic'));
});

test('simultaneous searches share requests and filters/refresh reuse persisted snapshots', async () => {
  const repository = memoryRepository();
  let calls = 0;
  const p = provider('a', async () => { calls++; await new Promise((resolve) => setImmediate(resolve)); return [job()]; });
  const aggregator = createJobAggregator({ providers: [p], repository });
  await Promise.all([aggregator(), aggregator({ q: 'React' }), aggregator({ q: 'SQL' })]);
  assert.equal(calls, 1);
  assert.equal((await aggregator({ refresh: true })).sources[0].status, 'cached');
  assert.equal(calls, 1);
  const restarted = createJobAggregator({ providers: [p], repository });
  assert.equal((await restarted()).jobs.length, 1);
  assert.equal(calls, 1);
});

test('expired cache is labeled stale during outages, bounded by seven days, and retries back off', async () => {
  let time = 10 * 24 * HOUR;
  const repository = memoryRepository();
  repository.writeSource('a', [job()], time - 2 * HOUR);
  let calls = 0;
  const aggregator = createJobAggregator({ repository, now: () => time, providers: [provider('a', async () => { calls++; throw new Error('down'); })] });
  const first = await aggregator();
  assert.equal(first.jobs.length, 1);
  assert.equal(first.sources[0].status, 'stale');
  assert.equal(first.jobs[0].sourceStatus, 'stale');
  await aggregator({ refresh: true });
  assert.equal(calls, 1);
  time += 8 * 24 * HOUR;
  const expired = await aggregator();
  assert.equal(expired.jobs.length, 0);
  assert.equal(expired.sources[0].status, 'error');
  assert.equal(calls, 2);
});

test('a successful empty feed removes old listings without inventing sample postings', async () => {
  const repository = memoryRepository();
  repository.writeSource('a', [job()], Date.now() - 2 * HOUR);
  const aggregator = createJobAggregator({ repository, providers: [provider('a', async () => [])] });
  const result = await aggregator();
  assert.equal(result.source, 'empty');
  assert.equal(result.sources[0].status, 'fresh');
  assert.deepEqual(repository.readSource('a').jobs, []);
  assert.deepEqual(result.jobs, []);
});

test('deduplication strips tracking, preserves distinct locations and same-source requisitions', () => {
  const result = deduplicateJobs([
    job(), job({ id: 'a:2', url: 'https://example.com/jobs/1?utm_source=newsletter#apply' }),
    job({ id: 'b:1', sourceId: 'b', url: 'https://elsewhere.example.com/jobs/3' }),
    job({ id: 'a:3', url: 'https://example.com/jobs/4' }),
    job({ id: 'b:2', sourceId: 'b', location: 'Berlin, Germany', url: 'https://elsewhere.example.com/jobs/5' }),
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].sources.some((source) => source.id === 'b'), true);
  assert.equal(filterJobs(result, { source: 'b' }).length, 2);
});

test('filters combine keyword, category and explicit region instead of ignoring category', () => {
  const jobs = [job(), job({ title: 'React Designer', category: 'Design' }), job({ location: 'Paris, France' }), job({ location: 'Remote', remote: true })];
  assert.equal(filterJobs(jobs, { q: 'react', category: 'design', region: 'seoul' }).length, 1);
  assert.equal(filterJobs(jobs, { region: 'europe' }).length, 1);
  assert.equal(filterJobs(jobs, { region: 'seoul' }).length, 2);
  assert.equal(filterJobs(jobs, { q: 'missing keyword' }).length, 0);
});

test('unknown employers do not merge by title and non-software engineers are not software/design jobs', () => {
  const jobs = [
    job({ company: 'Unknown company', title: 'Building Engineer', category: '', tags: [] }),
    job({ company: 'Unknown company', title: 'Building Engineer', category: '', tags: [], sourceId: 'b', url: 'https://other.example.com/jobs/1' }),
  ];
  assert.equal(deduplicateJobs(jobs).length, 2);
  assert.equal(filterJobs(jobs, { category: 'software-dev' }).length, 0);
  assert.equal(filterJobs(jobs, { category: 'design' }).length, 0);
});

test('LinkedIn and Indeed filters preserve web discovery provenance after deduplication', () => {
  const jobs = deduplicateJobs([
    job(),
    job({ id: 'web:1', sourceId: 'web', platform: 'linkedin', sourceName: 'LinkedIn', url: 'https://www.linkedin.com/jobs/view/1234', verification: 'search-discovered' }),
    job({ id: 'web:2', sourceId: 'web', platform: 'indeed', sourceName: 'Indeed', company: 'Other', url: 'https://sg.indeed.com/viewjob?jk=1234', verification: 'search-discovered' }),
  ]);
  assert.equal(jobs.length, 2);
  assert.equal(filterJobs(jobs, { source: 'linkedin' }).length, 1);
  assert.equal(filterJobs(jobs, { source: 'indeed' }).length, 1);
  assert.equal(filterJobs(jobs, { source: 'web' }).length, 2);
  assert.equal(filterJobs(jobs, { source: 'linkedin' })[0].sources.some((item) => item.platform === 'linkedin'), true);
});

test('SQLite persists snapshots, replaces obsolete rows, and expires web discoveries', () => {
  const time = Date.now();
  try {
    jobRepository.writeSource('test', [job()], time);
    assert.equal(jobRepository.readSource('test').jobs.length, 1);
    jobRepository.writeSource('test', [], time + 1);
    assert.deepEqual(jobRepository.readSource('test').jobs, []);
    jobRepository.saveDiscoveries([job({ discoveredAt: new Date(time).toISOString() })], time);
    assert.equal(jobRepository.readDiscoveries(time + 1).length, 1);
    assert.equal(jobRepository.readDiscoveries(time + DISCOVERY_TTL_MS + 1).length, 0);
  } finally {
    db.exec('DELETE FROM job_source_cache; DELETE FROM discovered_jobs;');
  }
});
