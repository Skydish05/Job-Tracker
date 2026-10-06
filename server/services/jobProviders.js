// Public feed documentation:
// https://github.com/remotive-com/remote-jobs-api
// https://www.arbeitnow.com/blog/job-board-api
// https://remoteok.featurebase.app/help/articles/3140840-is-there-an-api-or-rssjson-feed-of-remote-jobs
const REMOTIVE_API = 'https://remotive.com/api/remote-jobs';
const ARBEITNOW_API = 'https://www.arbeitnow.com/api/job-board-api';
const REMOTEOK_API = 'https://remoteok.com/api';
const MAX_ARBEITNOW_PAGES = 5;
const REQUEST_TIMEOUT_MS = 10_000;

function string(value) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

// Used for links only; this is not a DNS/SSRF guard for fetching arbitrary URLs.
export function safeJobUrl(value) {
  try {
    const url = new URL(string(value));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host) return '';
    if (host === '[::]' || host === '[::1]' || /^\[::ffff:/i.test(host)) return '';
    if (/^(?:0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return '';
    if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || /^\[(?:fc|fd|fe[89ab])/i.test(host)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function stripHtml(html = '') {
  const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return string(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|\/(?:p|li|h\d|div))\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, code) => {
      if (!code.startsWith('#')) return entities[code.toLowerCase()] || entity;
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function tags(value) {
  return Array.isArray(value) ? [...new Set(value.map(string).filter(Boolean).map((tag) => tag.toLowerCase()))] : [];
}

function date(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  if (value === '') return '';
  // Remotive sends ISO timestamps without an offset. Treat them consistently as
  // UTC so running the server in Seoul does not shift listings by nine hours.
  const iso = typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
  const timestamp = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(iso);
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? new Date(timestamp).toISOString() : '';
}

function isTrue(value) {
  return value === true || value === 1 || /^(true|1)$/i.test(string(value));
}

function isFalse(value) {
  return value === false || value === 0 || /^(false|0)$/i.test(string(value));
}

function isClosed(raw, now) {
  if (['closed', 'expired', 'is_closed', 'is_expired', 'archived'].some((key) => isTrue(raw[key]))) return true;
  if (['active', 'is_active', 'is_open'].some((key) => isFalse(raw[key]))) return true;
  if (/^(closed|expired|archived|inactive|filled|removed)$/i.test(string(raw.status))) return true;
  return ['validThrough', 'valid_through', 'expires_at', 'expiration_date', 'expiry_date', 'closed_at'].some((key) => {
    const expiry = date(raw[key]);
    return expiry && Date.parse(expiry) <= now;
  });
}

function normalize(raw, source, fields, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || isClosed(raw, now)) return null;
  const url = safeJobUrl(fields.url);
  const title = stripHtml(fields.title);
  const remoteId = string(fields.id);
  if (!url || !title || !remoteId) return null;
  return {
    id: `${source.id}:${remoteId}`,
    title,
    company: stripHtml(fields.company) || 'Unknown company',
    category: string(fields.category),
    tags: tags(fields.tags),
    location: string(fields.location),
    remote: fields.remote === true,
    jobType: string(fields.jobType),
    salary: string(fields.salary),
    url,
    postedAt: date(fields.postedAt),
    description: stripHtml(fields.description).slice(0, 12_000),
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: url,
    discoveredAt: new Date(now).toISOString(),
    // A feed listing is evidence of discovery, not a live check of the application form.
    verification: 'listed',
  };
}

export function normalizeRemotiveJob(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  return normalize(raw, { id: 'remotive', name: 'Remotive' }, {
    id: raw.id, title: raw.title, company: raw.company_name, category: raw.category,
    tags: raw.tags, location: raw.candidate_required_location, remote: true, jobType: raw.job_type,
    salary: raw.salary, url: raw.url, postedAt: raw.publication_date, description: raw.description,
  }, now);
}

function normalizeArbeitnowJob(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const jobTags = tags(raw.tags);
  if (raw.remote === true && !jobTags.includes('remote')) jobTags.push('remote');
  return normalize(raw, { id: 'arbeitnow', name: 'Arbeitnow' }, {
    id: raw.slug || raw.id, title: raw.title, company: raw.company_name,
    category: jobTags.find((tag) => tag !== 'remote') || '', tags: jobTags,
    location: raw.remote === true ? [string(raw.location), 'Remote'].filter(Boolean).join(' · ') : raw.location,
    remote: raw.remote === true,
    jobType: Array.isArray(raw.job_types) ? raw.job_types.map(string).filter(Boolean).join(', ') : raw.job_type,
    salary: raw.salary, url: raw.url, postedAt: raw.created_at, description: raw.description,
  }, now);
}

function normalizeRemoteokJob(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const salary = [raw.salary_min, raw.salary_max].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  return normalize(raw, { id: 'remoteok', name: 'Remote OK' }, {
    id: raw.id, title: raw.position, company: raw.company, category: raw.category,
    tags: raw.tags, location: raw.location || 'Remote', remote: true, jobType: raw.job_type,
    // The feed does not identify a currency; do not infer one from the board's default.
    salary: string(raw.salary) || salary.join(' – '),
    url: raw.url, postedAt: raw.date || raw.epoch, description: raw.description,
  }, now);
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'JobTracker/1.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // Feeds and pagination are fixed public endpoints; never follow a feed-controlled redirect.
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Job feed responded HTTP ${response.status}`);
  return response.json();
}

async function fetchRemotiveJobs({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  // No limit/search: cache the complete feed once, then filter locally.
  const data = await fetchJson(REMOTIVE_API, fetchImpl);
  if (!data || !Array.isArray(data.jobs)) throw new Error('Unexpected Remotive feed response');
  return data.jobs.map((raw) => normalizeRemotiveJob(raw, { now })).filter(Boolean);
}

function arbeitnowNext(value) {
  const next = safeJobUrl(value);
  if (!next) throw new Error('Invalid Arbeitnow pagination URL');
  const url = new URL(next);
  const expected = new URL(ARBEITNOW_API);
  const page = url.searchParams.get('page');
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || !/^[1-9]\d*$/.test(page || '') ||
      [...url.searchParams.keys()].some((key) => key !== 'page') || url.searchParams.getAll('page').length !== 1 || url.hash) {
    throw new Error('Unexpected Arbeitnow pagination URL');
  }
  return `${ARBEITNOW_API}?page=${page}`;
}

async function fetchArbeitnowJobs({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const jobs = new Map();
  const visited = new Set();
  let next = ARBEITNOW_API;
  for (let page = 0; next && page < MAX_ARBEITNOW_PAGES; page++) {
    try {
      if (visited.has(next)) throw new Error('Arbeitnow pagination repeated a page');
      visited.add(next);
      const data = await fetchJson(next, fetchImpl);
      if (!data || !Array.isArray(data.data)) throw new Error('Unexpected Arbeitnow feed response');
      for (const raw of data.data) {
        const job = normalizeArbeitnowJob(raw, now);
        if (job) jobs.set(job.id, job);
      }
      // Empty pages and a missing next link are valid ends of this public feed.
      const nextLink = data.links?.next ?? data.meta?.next;
      next = data.data.length && nextLink ? arbeitnowNext(nextLink) : null;
    } catch (cause) {
      // Do not silently present an incomplete refresh as a successful full snapshot.
      const error = new Error(`Arbeitnow page ${page + 1} failed: ${cause?.message || String(cause)}`, { cause });
      error.partialJobs = [...jobs.values()];
      throw error;
    }
  }
  return [...jobs.values()];
}

async function fetchRemoteokJobs({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const data = await fetchJson(REMOTEOK_API, fetchImpl);
  if (!Array.isArray(data)) throw new Error('Unexpected Remote OK feed response');
  // The first row contains legal/last_updated metadata, not a job.
  return data.map((raw) => normalizeRemoteokJob(raw, now)).filter(Boolean);
}

export const PROVIDERS = [
  { id: 'remotive', name: 'Remotive', url: 'https://remotive.com', ttlMs: 6 * 60 * 60 * 1000, fetchJobs: fetchRemotiveJobs },
  { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com', ttlMs: 60 * 60 * 1000, fetchJobs: fetchArbeitnowJobs },
  { id: 'remoteok', name: 'Remote OK', url: 'https://remoteok.com', ttlMs: 60 * 60 * 1000, fetchJobs: fetchRemoteokJobs },
];
