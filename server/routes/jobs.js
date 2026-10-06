import { fetchJobs } from '../services/jobApiService.js';
import { getProfile } from './profile.js';
import { HttpError } from '../router.js';
import { discoverJobs, isDiscoveryConfigured, DISCOVERY_TARGETS } from '../services/jobDiscoveryService.js';
import { jobRepository } from '../services/jobRepository.js';
import { REGIONS, regionSearchLocation } from '../services/jobRegions.js';

const CATEGORIES = new Set(['all', 'software-dev', 'data', 'product', 'design', 'qa', 'devops']);
const SOURCES = new Set(['all', 'remotive', 'arbeitnow', 'remoteok', 'web', 'linkedin', 'indeed']);
const REGION_IDS = new Set(REGIONS.map((region) => region.id));
const SEARCH_TARGETS = new Set(DISCOVERY_TARGETS.map((target) => target.id));

function text(value, name, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${name} must be text of at most ${max} characters`);
  return value.trim();
}

function integer(value, fallback, max, name) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new HttpError(400, `Invalid ${name}`);
  return Number(value);
}

function postingTime(job) {
  for (const value of [job.postedAt, job.discoveredAt]) {
    const time = Date.parse(value);
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

export function registerJobs(router) {
  router.get('/api/jobs', async ({ query }) => {
    const category = query.category || 'all';
    const sourceFilter = query.source || 'all';
    const region = query.region || 'all';
    if (!CATEGORIES.has(category) || !SOURCES.has(sourceFilter) || !REGION_IDS.has(region)) throw new HttpError(400, 'Unknown category, source, or region');
    const offset = integer(query.offset, 0, 1_000_000, 'offset');
    const limit = Math.max(1, integer(query.limit, 25, 100, 'limit'));
    const { jobs, source, cached, warning, sources, totalAvailable } = await fetchJobs({
      q: text(query.q, 'q', 300),
      location: text(query.location, 'location', 120),
      region,
      category,
      source: sourceFilter,
      refresh: query.refresh === '1',
    });
    const ordered = [...jobs].sort((a, b) => postingTime(b) - postingTime(a) || String(a.id).localeCompare(String(b.id)));
    return {
      source, cached, warning: warning || null, sources, totalAvailable, offset, limit,
      hasMore: offset + limit < ordered.length,
      discovery: { enabled: isDiscoveryConfigured() },
      total: ordered.length,
      jobs: ordered.slice(offset, offset + limit),
    };
  });

  router.post('/api/jobs/discover', async ({ body }) => {
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(400, 'A JSON object is required');
    const q = text(body.q, 'q', 300);
    const region = body.region || 'all';
    if (!REGION_IDS.has(region)) throw new HttpError(400, 'Unknown region');
    const target = body.target === undefined ? 'all' : body.target;
    if (!SEARCH_TARGETS.has(target)) throw new HttpError(400, 'Unknown web search target');
    const location = [regionSearchLocation(region), text(body.location, 'location', 120)].filter(Boolean).join(' ');
    if (!isDiscoveryConfigured()) throw new HttpError(503, 'Set TAVILY_API_KEY and GEMINI_API_KEY on the server to enable web discovery.');
    const profile = getProfile();
    if (!q && !profile.skills.trim() && !profile.target_roles.trim()) throw new HttpError(400, 'Enter a job search or add skills and target roles to your profile.');
    try {
      const result = await discoverJobs({ q, location, profile, target });
      jobRepository.saveDiscoveries(result.jobs);
      return result;
    } catch (error) {
      if ([400, 429, 502, 503].includes(error.statusCode)) throw new HttpError(error.statusCode, error.message);
      throw new HttpError(502, 'Web discovery is unavailable. Existing job listings have been kept. Try again later.');
    }
  });
}
