import { sampleJobs } from './sampleJobs.js';

// Remotive public API (no key needed): https://remotive.com/api/remote-jobs
// Remotive asks clients not to poll often, so results are cached in memory.
const API_URL = 'https://remotive.com/api/remote-jobs';
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // key -> { at, jobs }

export function stripHtml(html = '') {
  return String(html)
    .replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Map one raw Remotive job onto the shape the rest of the app uses.
export function normalizeJob(raw) {
  return {
    id: String(raw.id),
    title: raw.title || 'Untitled role',
    company: raw.company_name || 'Unknown company',
    category: raw.category || '',
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).toLowerCase()) : [],
    location: raw.candidate_required_location || '',
    jobType: raw.job_type || '',
    salary: raw.salary || '',
    url: raw.url || '',
    postedAt: raw.publication_date || '',
    description: stripHtml(raw.description).slice(0, 4000),
  };
}

export async function fetchJobs({ q = '', category = 'software-dev', refresh = false } = {}) {
  const key = `${q}|${category}`;
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { jobs: hit.jobs, source: 'live', cached: true };
  }

  const url = new URL(API_URL);
  url.searchParams.set('limit', '100');
  if (q) url.searchParams.set('search', q);
  else if (category && category !== 'all') url.searchParams.set('category', category);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Job API responded ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.jobs)) throw new Error('Unexpected job API response shape');
    const jobs = data.jobs.map(normalizeJob);
    cache.set(key, { at: Date.now(), jobs });
    return { jobs, source: 'live', cached: false };
  } catch (err) {
    // Serve stale cache before falling back to sample data.
    if (hit) return { jobs: hit.jobs, source: 'live', cached: true, warning: 'Showing cached results' };
    const needle = q.toLowerCase();
    const jobs = needle
      ? sampleJobs.filter((j) =>
          `${j.title} ${j.company} ${j.tags.join(' ')} ${j.description}`.toLowerCase().includes(needle)
        )
      : sampleJobs;
    return {
      jobs,
      source: 'sample',
      cached: false,
      warning: `Live job API unavailable (${err.message}). Showing sample postings.`,
    };
  }
}
