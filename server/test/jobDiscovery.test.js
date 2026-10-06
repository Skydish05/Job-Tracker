import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const savedEnv = { TAVILY_API_KEY: process.env.TAVILY_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_SEARCH_MODEL: process.env.GEMINI_SEARCH_MODEL };
let service;
let calls;
let searchResults;
let modelRows;
let sequence = 0;
let handler;

function source(overrides = {}) {
  return {
    title: 'Frontend Engineer at Acme', url: 'https://jobs.acme.example/openings/frontend-123',
    content: 'Acme is hiring a Frontend Engineer in Seoul. Build accessible React applications with our team. Full time.',
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    sourceIndex: 0, title: 'Frontend Engineer', company: 'Acme', location: 'Seoul', jobType: 'Full time', salary: '',
    tags: ['React'], postedAt: '', deadline: '', evidence: 'Build accessible React applications with our team.',
    isSingleJob: true, isOpen: true, ...overrides,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function modelResponse(rows = modelRows) {
  return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ jobs: rows }) }] } }] });
}

beforeEach(async () => {
  process.env.TAVILY_API_KEY = 'test-search-secret';
  process.env.GEMINI_API_KEY = 'test-model-secret';
  delete process.env.GEMINI_SEARCH_MODEL;
  calls = [];
  searchResults = [source()];
  modelRows = [row()];
  handler = (url) => url === 'https://api.tavily.com/search' ? json({ results: searchResults }) : modelResponse();
  globalThis.fetch = async (url, options) => {
    const call = { url: String(url), ...options, body: JSON.parse(options.body) };
    calls.push(call);
    return handler(call.url, call);
  };
  service = await import(`../services/jobDiscoveryService.js?test=${sequence++}`);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('searches separately from extraction and sends only relevant profile fields', async () => {
  const result = await service.discoverJobs({ q: 'frontend engineer', location: 'Seoul', profile: {
    name: 'Private Person', summary: 'private biography', skills: 'React, SQL', target_roles: 'Frontend Engineer', experience: 'junior',
  } });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.tavily.com/search');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-search-secret');
  assert.equal(calls[0].body.max_results, 20);
  assert.equal(calls[0].body.search_depth, 'basic');
  assert.equal(calls[0].body.include_answer, false);
  assert.equal(calls[0].body.include_raw_content, false);
  assert.equal(calls[0].body.include_domains, undefined);
  assert.ok(calls[1].body.include_domains.includes('jobs.lever.co'));
  assert.ok(calls[1].body.include_domains.includes('myworkdayjobs.com'));
  assert.ok(calls[1].body.include_domains.includes('job-boards.greenhouse.io'));
  assert.ok(calls.slice(0, 2).every((call) => !call.body.query.includes('site:')));
  assert.match(calls[0].body.query, /frontend engineer Seoul junior/);
  const extraction = calls[2];
  assert.match(extraction.url, /gemini-3\.8-flash:generateContent$/);
  assert.equal(extraction.headers['x-goog-api-key'], 'test-model-secret');
  assert.equal(extraction.body.tools, undefined);
  assert.equal(extraction.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(extraction.body.generationConfig.responseJsonSchema.properties.jobs.maxItems, 20);
  const prompt = JSON.parse(extraction.body.contents[0].parts[0].text);
  assert.equal(prompt.currentDate, new Date().toISOString().slice(0, 10));
  assert.deepEqual(prompt.criteria.profile, { skills: 'React, SQL', target_roles: 'Frontend Engineer', experience: 'junior' });
  assert.equal(prompt.sources.length, 1); // repeated search source is deduplicated
  assert.doesNotMatch(JSON.stringify(calls.map((call) => call.body)), /Private Person|private biography|test-search-secret|test-model-secret/);
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
  assert.equal(calls[0].signal, calls[2].signal); // one complete-operation deadline
  assert.equal(result.jobs.length, 1);
  assert.match(result.jobs[0].id, /^web:[a-f0-9]{24}$/);
  assert.equal(result.jobs[0].url, source().url);
  assert.equal(result.jobs[0].verification, 'search-discovered');
  assert.equal(result.jobs[0].platform, 'web');
  assert.equal(result.target, 'all');
  assert.equal(result.jobs[0].description, row().evidence);
  assert.deepEqual(result.sources, [{ title: source().title, url: source().url }]);
  assert.match(result.warning, /has not been verified/);
});

test('URL comes from search evidence and unsupported fields are discarded', async () => {
  modelRows = [row({ url: 'https://invented.example/jobs/123', salary: '$250,000', location: 'Tokyo', tags: ['React', 'Rust'], postedAt: '2020-01-02' })];
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.equal(result.jobs[0].url, source().url);
  assert.equal(result.jobs[0].salary, '');
  assert.equal(result.jobs[0].location, '');
  assert.equal(result.jobs[0].postedAt, '');
  assert.deepEqual(result.jobs[0].tags, ['react']);
});

test('rejects invented companies, unsupported descriptions, bad source indices and expired listings', async () => {
  modelRows = [
    row({ sourceIndex: 99 }), row({ company: 'Invented Corp' }), row({ evidence: 'A made up description that does not occur in the result.' }),
    row({ deadline: '2000-01-01' }), row({ isSingleJob: false }), row({ isOpen: false }), row({ company: 'Unknown company' }),
  ];
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.deepEqual(result.jobs, []);
  assert.deepEqual(result.sources, []);
  assert.match(result.warning, /enough source evidence/);
});

test('skips closed posts, job indexes and unsafe links before contacting the model', async () => {
  searchResults = [
    source({ content: 'Acme is hiring a Frontend Engineer. This position has been filled.' }),
    source({ content: 'Acme is hiring a Frontend Engineer. Application deadline: 2000-01-01.' }),
    source({ url: 'https://jobs.acme.example/careers' }),
    source({ url: 'https://jobs.lever.co/acme' }),
    source({ title: '1,000+ jobs in Seoul', url: 'https://jobs.acme.example/seoul' }),
    source({ url: 'javascript:alert(1)' }), source({ url: 'http://127.0.0.1/secret' }),
    source({ url: 'https://user:password@jobs.acme.example/job/123' }),
  ];
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.jobs, []);
});

test('empty search results do not trigger model use or manufacture postings', async () => {
  searchResults = [];
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.jobs, []);
});

test('requires both keys and a search intent before network access', async () => {
  delete process.env.TAVILY_API_KEY;
  assert.equal(service.isDiscoveryConfigured(), false);
  await assert.rejects(service.discoverJobs({ q: 'frontend' }), { statusCode: 503 });
  process.env.TAVILY_API_KEY = 'search';
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(service.discoverJobs({ q: 'frontend' }), { statusCode: 503 });
  process.env.GEMINI_API_KEY = 'gemini';
  assert.equal(service.isDiscoveryConfigured(), true);
  await assert.rejects(service.discoverJobs(), { statusCode: 400 });
  assert.equal(calls.length, 0);
});

test('uses profile roles when there is no explicit query and honors model override', async () => {
  process.env.GEMINI_SEARCH_MODEL = 'test-model';
  const result = await service.discoverJobs({ profile: { target_roles: 'Frontend Engineer', skills: 'React', experience: 'junior' } });
  assert.match(calls[0].body.query, /Frontend Engineer/);
  assert.match(calls[2].url, /test-model:generateContent$/);
  assert.equal(result.model, 'test-model');
});

test('shares concurrent requests and caches by query, location and relevant profile fields', async () => {
  const options = { q: 'frontend', location: 'Seoul', profile: { name: 'A', skills: 'React' } };
  const [first, second] = await Promise.all([service.discoverJobs(options), service.discoverJobs(options)]);
  assert.equal(calls.length, 3);
  assert.deepEqual(first, second);
  first.jobs[0].title = 'Mutated by caller';
  const cached = await service.discoverJobs({ ...options, refresh: true, profile: { name: 'B', skills: 'React' } });
  assert.equal(calls.length, 3);
  assert.equal(cached.cached, true);
  assert.equal(cached.jobs[0].title, 'Frontend Engineer');
  await service.discoverJobs({ ...options, location: 'Remote' });
  await service.discoverJobs({ ...options, profile: { skills: 'SQL' } });
  assert.equal(calls.length, 9);
});

test('cache entries expire after one hour and the cache is bounded', async (t) => {
  await service.discoverJobs({ q: 'initial' });
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 3_600_001);
  const refreshed = await service.discoverJobs({ q: 'initial' });
  assert.equal(refreshed.cached, false);
  assert.equal(calls.length, 6);
  for (let i = 0; i < 32; i++) await service.discoverJobs({ q: `different-${i}` });
  const evicted = await service.discoverJobs({ q: 'initial' });
  assert.equal(evicted.cached, false);
  assert.equal(calls.length, 105);
});

test('a failed search query can return partial evidence with a warning', async () => {
  handler = (url, call) => url === 'https://api.tavily.com/search'
    ? call.body.include_domains ? json({ error: 'secret provider detail' }, 500) : json({ results: searchResults })
    : modelResponse();
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.equal(result.jobs.length, 1);
  assert.match(result.warning, /One search query failed/);
});

test('provider failures and timeout details are sanitized and never cached', async () => {
  handler = () => json({ detail: 'private response test-search-secret' }, 401);
  await assert.rejects(service.discoverJobs({ q: 'frontend' }), (error) => {
    assert.equal(error.statusCode, 502);
    assert.doesNotMatch(error.message, /private response|test-search-secret|401/);
    return true;
  });
  handler = () => { throw Object.assign(new Error('secret network detail'), { name: 'TimeoutError' }); };
  await assert.rejects(service.discoverJobs({ q: 'frontend' }), /timed out/);
  assert.equal(calls.length, 4);
});

test('retries unsupported structured output once and remembers successful compatibility per model', async () => {
  handler = (url, call) => {
    if (url === 'https://api.tavily.com/search') return json({ results: searchResults });
    if (call.body.generationConfig.responseJsonSchema) {
      return json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'private provider detail' } }, 400);
    }
    return modelResponse();
  };
  const result = await service.discoverJobs({ q: 'frontend' });
  let extractionCalls = calls.filter((call) => call.url !== 'https://api.tavily.com/search');
  assert.equal(extractionCalls.length, 2);
  const [structured, compatible] = extractionCalls;
  assert.ok(structured.body.generationConfig.responseJsonSchema);
  assert.deepEqual(compatible.body.generationConfig, { maxOutputTokens: 4096 });
  const prompt = compatible.body.systemInstruction.parts.map((part) => part.text).join('\n');
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /"properties"/);
  assert.match(prompt, /"sourceIndex"/);
  assert.match(prompt, /"isSingleJob"/);
  assert.doesNotMatch(prompt, /private provider detail|test-model-secret/);
  assert.deepEqual(compatible.body.contents, structured.body.contents);
  assert.equal(compatible.signal, structured.signal);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].url, source().url);

  await service.discoverJobs({ q: 'react frontend' });
  extractionCalls = calls.filter((call) => call.url !== 'https://api.tavily.com/search');
  assert.equal(extractionCalls.length, 3);
  assert.deepEqual(extractionCalls[2].body.generationConfig, { maxOutputTokens: 4096 });

  process.env.GEMINI_SEARCH_MODEL = 'another-model';
  await service.discoverJobs({ q: 'frontend' });
  extractionCalls = calls.filter((call) => call.url !== 'https://api.tavily.com/search');
  assert.equal(extractionCalls.length, 5);
  assert.ok(extractionCalls[3].body.generationConfig.responseJsonSchema);
  assert.deepEqual(extractionCalls[4].body.generationConfig, { maxOutputTokens: 4096 });
});

test('does not retry authentication, missing model, rate limit or service errors as schema incompatibility', async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    const start = calls.length;
    handler = (url) => url === 'https://api.tavily.com/search'
      ? json({ results: searchResults })
      : json({ error: { code: status, message: 'private provider detail test-model-secret' } }, status);
    await assert.rejects(service.discoverJobs({ q: `frontend ${status}` }), (error) => {
      assert.ok([429, 502, 503].includes(error.statusCode));
      assert.doesNotMatch(error.message, /private provider detail|test-model-secret/);
      return true;
    });
    const extractionCalls = calls.slice(start).filter((call) => call.url !== 'https://api.tavily.com/search');
    assert.equal(extractionCalls.length, 1, `HTTP ${status} must not retry in compatibility mode`);
    assert.ok(extractionCalls[0].body.generationConfig.responseJsonSchema);
  }
});

test('compatibility output still rejects malformed, oversized and unfinished model data', async () => {
  const invalid = [
    { candidates: [{ content: { parts: [{ text: 'Here are jobs: not JSON' }] } }] },
    { candidates: [{ content: { parts: [{ text: JSON.stringify({ jobs: Array(21).fill(row()) }) }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify({ jobs: [row()] }) }] } }] },
  ];
  for (const [index, response] of invalid.entries()) {
    process.env.GEMINI_SEARCH_MODEL = `incompatible-model-${index}`;
    const start = calls.length;
    handler = (url, call) => {
      if (url === 'https://api.tavily.com/search') return json({ results: searchResults });
      return call.body.generationConfig.responseJsonSchema
        ? json({ error: { code: 400, status: 'INVALID_ARGUMENT' } }, 400)
        : json(response);
    };
    await assert.rejects(service.discoverJobs({ q: 'frontend' }), { statusCode: 502 });
    const extractionCalls = calls.slice(start).filter((call) => call.url !== 'https://api.tavily.com/search');
    assert.equal(extractionCalls.length, 2);
    assert.deepEqual(extractionCalls[1].body.generationConfig, { maxOutputTokens: 4096 });
  }
});

test('does not repeatedly retry a rejected compatibility request', async () => {
  handler = (url) => url === 'https://api.tavily.com/search'
    ? json({ results: searchResults })
    : json({ error: { code: 400, status: 'INVALID_ARGUMENT' } }, 400);
  await assert.rejects(service.discoverJobs({ q: 'frontend' }), { statusCode: 502 });
  assert.equal(calls.filter((call) => call.url !== 'https://api.tavily.com/search').length, 2);
});

test('malformed, oversized or unfinished model results fail closed', async () => {
  const invalid = [
    { candidates: [{ content: { parts: [{ text: 'Here are jobs: not JSON' }] } }] },
    { candidates: [{ content: { parts: [{ text: JSON.stringify({ jobs: Array(21).fill(row()) }) }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify({ jobs: [row()] }) }] } }] },
  ];
  for (const response of invalid) {
    handler = (url) => url === 'https://api.tavily.com/search' ? json({ results: searchResults }) : json(response);
    await assert.rejects(service.discoverJobs({ q: 'frontend' }), { statusCode: 502 });
  }
});

test('supports Korean source text without treating role text as instructions', async () => {
  searchResults = [source({ title: '아크미 프론트엔드 개발자', content: '아크미에서 프론트엔드 개발자를 채용합니다. 서울에서 React 기반 웹 서비스를 개발하는 업무입니다.' })];
  modelRows = [row({ title: '프론트엔드 개발자', company: '아크미', location: '서울', evidence: '서울에서 React 기반 웹 서비스를 개발하는 업무입니다.' })];
  const result = await service.discoverJobs({ q: '프론트엔드 개발자' });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].company, '아크미');
  assert.match(calls[2].body.systemInstruction.parts[0].text, /untrusted data/);
});

test('exposes supported search targets and rejects unknown targets before network access', async () => {
  assert.deepEqual(service.DISCOVERY_TARGETS.map(({ id }) => id), ['all', 'company', 'linkedin', 'indeed']);
  assert.equal(service.DISCOVERY_TARGETS.find(({ id }) => id === 'company').label, 'Company career sites (ATS)');
  for (const target of ['other', 'LinkedIn', '', null, [], {}]) {
    await assert.rejects(service.discoverJobs({ q: 'frontend', target }), { statusCode: 400 });
  }
  assert.equal(calls.length, 0);
});

test('LinkedIn searches use provider domain filters and retain verified regional posting URLs', async () => {
  for (const host of ['www.linkedin.com', 'kr.linkedin.com', 'sg.linkedin.com', 'hk.linkedin.com']) {
    const url = `https://${host}/jobs/view/frontend-engineer-at-acme-1234567890?trackingId=original`;
    searchResults = [source({ url })];
    const start = calls.length;
    const result = await service.discoverJobs({ q: host, location: 'Seoul', target: 'linkedin' });
    const currentCalls = calls.slice(start);
    assert.equal(currentCalls.length, 3);
    assert.ok(currentCalls.slice(0, 2).every((call) => JSON.stringify(call.body.include_domains) === '["linkedin.com"]'));
    assert.equal(result.target, 'linkedin');
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].url, url);
    assert.equal(result.jobs[0].sourceId, 'web');
    assert.equal(result.jobs[0].platform, 'linkedin');
    assert.equal(result.jobs[0].sourceName, 'LinkedIn');
  }
});

test('LinkedIn target rejects lookalike hosts, profiles and search pages before extraction', async () => {
  searchResults = [
    'https://linkedin.com.evil.example/jobs/view/123',
    'https://notlinkedin.com/jobs/view/123',
    'https://www.linkedin.com/in/a-recruiter',
    'https://www.linkedin.com/jobs/search?keywords=Frontend',
    'https://www.linkedin.com/jobs/frontend-engineer-jobs',
    'https://www.linkedin.com/jobs/view/',
    'https://www.indeed.com/viewjob?jk=abc123',
  ].map((url) => source({ url }));
  const result = await service.discoverJobs({ q: 'frontend', target: 'linkedin' });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.jobs, []);
});

test('Indeed searches accept individual desktop and mobile postings from regional subdomains', async () => {
  for (const [host, path] of [
    ['www.indeed.com', '/viewjob'], ['kr.indeed.com', '/viewjob'], ['sg.indeed.com', '/m/viewjob'],
    ['hk.indeed.com', '/viewjob'], ['ca.indeed.com', '/viewjob'], ['uk.indeed.com', '/viewjob'], ['de.indeed.com', '/viewjob'],
  ]) {
    const url = `https://${host}${path}?jk=abc123&from=search`;
    searchResults = [source({ url })];
    const start = calls.length;
    const result = await service.discoverJobs({ q: host, target: 'indeed' });
    const currentCalls = calls.slice(start);
    assert.equal(currentCalls.length, 3);
    assert.ok(currentCalls.slice(0, 2).every((call) => JSON.stringify(call.body.include_domains) === '["indeed.com"]'));
    assert.equal(result.target, 'indeed');
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].url, url);
    assert.equal(result.jobs[0].sourceId, 'web');
    assert.equal(result.jobs[0].platform, 'indeed');
    assert.equal(result.jobs[0].sourceName, 'Indeed');
  }
});

test('Indeed target rejects lookalike hosts, listing pages and URLs without a job identifier', async () => {
  searchResults = [
    'https://indeed.com.evil.example/viewjob?jk=abc123',
    'https://notindeed.com/viewjob?jk=abc123',
    'https://www.indeed.com/jobs?q=frontend',
    'https://www.indeed.com/q-frontend-l-Seoul-jobs.html',
    'https://www.indeed.com/viewjob',
    'https://www.indeed.com/m/viewjob?jk=',
    'https://www.indeed.com/viewjob?jk=%20',
    'https://www.linkedin.com/jobs/view/123',
  ].map((url) => source({ url }));
  const result = await service.discoverJobs({ q: 'frontend', target: 'indeed' });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.jobs, []);
});

test('company target uses known ATS domains and checks returned host boundaries', async () => {
  searchResults = [
    source({ url: 'https://jobs.lever.co.evil.example/acme/123' }),
    source(),
    source({ url: 'https://acme.myworkdayjobs.com/en-US/External/job/Seoul/Frontend_R123' }),
    source({ url: 'https://job-boards.greenhouse.io/acme/jobs/123456' }),
  ];
  modelRows = [row(), row({ sourceIndex: 1 })];
  const result = await service.discoverJobs({ q: 'frontend', target: 'company' });
  assert.equal(calls.length, 3);
  assert.ok(calls.slice(0, 2).every((call) => call.body.include_domains.includes('myworkdayjobs.com')));
  const evidenceSources = JSON.parse(calls[2].body.contents[0].parts[0].text).sources;
  assert.deepEqual(evidenceSources.map(({ url }) => url), searchResults.slice(2).map(({ url }) => url));
  assert.equal(result.target, 'company');
  assert.equal(result.jobs.length, 2);
  assert.ok(result.jobs.every((job) => job.platform === 'company' && job.sourceId === 'web' && job.sourceName === 'Company careers'));
});

test('all-web results preserve platform attribution and exclude platform listing pages', async () => {
  searchResults = [
    source({ url: 'https://www.linkedin.com/jobs/frontend-engineer-jobs' }),
    source({ url: 'https://www.indeed.com/q-frontend-jobs.html' }),
    source({ url: 'https://www.linkedin.com/jobs/view/frontend-at-acme-123' }),
    source({ url: 'https://www.indeed.com/viewjob?jk=abc123' }),
    source(),
  ];
  modelRows = [row(), row({ sourceIndex: 1 }), row({ sourceIndex: 2 })];
  const result = await service.discoverJobs({ q: 'frontend' });
  assert.equal(calls.length, 3);
  assert.deepEqual(result.jobs.map(({ platform }) => platform), ['linkedin', 'indeed', 'web']);
});

test('discovery caches are isolated by selected target', async () => {
  searchResults = [source({ url: 'https://www.linkedin.com/jobs/view/frontend-at-acme-123' })];
  const general = await service.discoverJobs({ q: 'frontend', target: 'all' });
  const linkedIn = await service.discoverJobs({ q: 'frontend', target: 'linkedin' });
  const indeed = await service.discoverJobs({ q: 'frontend', target: 'indeed' });
  assert.equal(calls.length, 8);
  assert.equal(general.jobs.length, 1);
  assert.equal(linkedIn.jobs.length, 1);
  assert.deepEqual(indeed.jobs, []);
  assert.equal((await service.discoverJobs({ q: 'frontend', target: 'linkedin' })).cached, true);
  assert.equal(calls.length, 8);
});
