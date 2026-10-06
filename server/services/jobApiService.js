import { PROVIDERS, normalizeRemotiveJob, stripHtml } from './jobProviders.js';
import { jobRepository } from './jobRepository.js';
import { regionMatches } from './jobRegions.js';

export { stripHtml };
// Compatibility for callers of the original normalizer; feed IDs are namespaced.
export function normalizeJob(raw) {
  const job = normalizeRemotiveJob(raw);
  return job ? { ...job, id: String(raw.id) } : null;
}

const HOUR = 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * HOUR;
const RETRY_MS = 60 * 1000;

export function canonicalJobUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|ref|referrer|source|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
}

const normalizeText = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();

export function deduplicateJobs(jobs) {
  const byUrl = new Map();
  const byRole = new Map();
  const output = [];
  for (const job of jobs) {
    const url = canonicalJobUrl(job.url);
    if (!url || !job.title || !job.company) continue;
    // Never merge different locations or same-provider requisitions by title.
    const key = [job.company, job.title, job.location].map(normalizeText).join('|');
    const candidates = byRole.get(key) || [];
    const knownCompany = !/^(unknown(?: company)?|n\/?a|not (provided|specified))$/i.test(job.company.trim());
    const previous = byUrl.get(url) || (knownCompany && candidates.find((candidate) => !candidate.sources.some((source) => source.id === job.sourceId)));
    const attribution = { id: job.sourceId, name: job.sourceName, url: job.url, platform: job.platform };
    if (previous) {
      if (!previous.sources.some((source) => source.id === attribution.id && source.url === attribution.url)) previous.sources.push(attribution);
      byUrl.set(url, previous);
      continue;
    }
    const entry = { ...job, sources: [attribution] };
    output.push(entry);
    byUrl.set(url, entry);
    candidates.push(entry);
    byRole.set(key, candidates);
  }
  return output;
}

const CATEGORY_PATTERNS = {
  'software-dev': /software|developer|programmer|front.?end|back.?end|full.?stack|소프트웨어|개발자|프론트엔드|백엔드/i,
  data: /data|analytics|machine learning|데이터|분석/i,
  product: /product|프로덕트|제품/i,
  design: /design|\bux\b|\bui\b|디자인/i,
  qa: /\bqa\b|quality|test|테스트|품질/i,
  devops: /devops|sysadmin|systems administrator|site reliability|\bsre\b|infrastructure|인프라/i,
};

export function filterJobs(jobs, { q = '', category = 'all', location = '', source = 'all', region = 'all' } = {}) {
  const terms = normalizeText(q).split(/\s+/).filter(Boolean);
  const locationNeedle = normalizeText(location);
  const regionAliases = /^(korea|south korea|한국|대한민국)$/.test(locationNeedle)
    ? ['korea', '한국', '대한민국', 'seoul', '서울', 'busan', '부산']
    : /^(seoul|서울)$/.test(locationNeedle) ? ['seoul', '서울'] : [locationNeedle];
  return jobs.filter((job) => {
    if (!regionMatches(job, region)) return false;
    if (source !== 'all' && job.sourceId !== source && job.platform !== source &&
        !job.sources?.some((s) => s.id === source || s.platform === source)) return false;
    const text = normalizeText([job.title, job.company, job.tags.join(' '), job.description].join(' '));
    if (!terms.every((term) => text.includes(term))) return false;
    const categoryText = [job.category, job.title, job.tags.join(' ')].join(' ');
    if (category !== 'all' && CATEGORY_PATTERNS[category] && !CATEGORY_PATTERNS[category].test(categoryText)) return false;
    if (locationNeedle) {
      if (/^(remote|원격)$/.test(locationNeedle)) {
        if (!job.remote && !/remote|worldwide|anywhere|원격/i.test(job.location)) return false;
      } else if (!regionAliases.some((alias) => normalizeText(job.location).includes(alias))) return false;
    }
    return true;
  });
}

export function createJobAggregator({ providers = PROVIDERS, repository = jobRepository, now = Date.now } = {}) {
  const pending = new Map();
  const attempts = new Map();

  async function collect(provider) {
    if (pending.has(provider.id)) return pending.get(provider.id);
    const snapshot = repository.readSource(provider.id);
    const time = now();
    const ttl = provider.ttlMs || (provider.id === 'remotive' ? 6 * HOUR : HOUR);
    const age = snapshot ? time - snapshot.fetchedAt : Infinity;
    const lastAttempt = attempts.get(provider.id);
    const info = (status, jobs, fetchedAt, error = null) => ({
      jobs: jobs.map((job) => ({ ...job, cached: status !== 'fresh', sourceStatus: status })),
      source: { id: provider.id, name: provider.name, url: provider.url, status, count: jobs.length,
        updatedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null, error },
    });
    if (snapshot && age < ttl) return info('cached', snapshot.jobs, snapshot.fetchedAt);
    if (lastAttempt && time - lastAttempt.at < RETRY_MS) {
      return snapshot && age < MAX_STALE_MS
        ? info('stale', snapshot.jobs, snapshot.fetchedAt, lastAttempt.error)
        : info('error', [], null, lastAttempt.error);
    }
    const task = (async () => {
      try {
        const jobs = await provider.fetchJobs();
        if (!Array.isArray(jobs)) throw new Error('Invalid jobs response');
        const fetchedAt = now();
        repository.writeSource(provider.id, jobs, fetchedAt);
        attempts.delete(provider.id);
        return info('fresh', jobs, fetchedAt);
      } catch {
        const message = `${provider.name} could not be reached. Please try again later.`;
        attempts.set(provider.id, { at: now(), error: message });
        return snapshot && now() - snapshot.fetchedAt < MAX_STALE_MS
          ? info('stale', snapshot.jobs, snapshot.fetchedAt, message)
          : info('error', [], null, message);
      }
    })();
    pending.set(provider.id, task);
    try { return await task; } finally { pending.delete(provider.id); }
  }

  return async function fetchJobs(options = {}) {
    // Refresh respects each provider's minimum interval; filters reuse snapshots.
    const results = await Promise.all(providers.map(collect));
    const discovered = repository.readDiscoveries(now());
    const sources = results.map((r) => r.source);
    if (discovered.length) sources.push({ id: 'web', name: 'Web search', url: '', status: 'cached', count: discovered.length,
      updatedAt: discovered[0].discoveredAt, error: null });
    const combined = results.flatMap((r) => r.jobs);
    // Prefer fresh provider evidence over stale copies and search-only leads.
    combined.sort((a, b) => Number(a.sourceStatus === 'stale') - Number(b.sourceStatus === 'stale'));
    const all = deduplicateJobs([...combined, ...discovered]);
    const jobs = filterJobs(all, options);
    const failed = sources.filter((s) => s.status === 'error' || s.status === 'stale');
    const fresh = sources.some((s) => s.status === 'fresh');
    const warning = failed.length
      ? `${failed.map((s) => s.name).join(', ')} unavailable.${failed.some((s) => s.status === 'stale') ? ' Older cached postings are shown; check availability on the original page.' : ''}`
      : null;
    return { jobs, totalAvailable: all.length, sources, warning,
      source: !all.length ? 'empty' : failed.length ? 'mixed' : fresh ? 'live' : 'cached',
      cached: !fresh };
  };
}

export const fetchJobs = createJobAggregator();
