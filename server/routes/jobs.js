import { fetchJobs } from '../services/jobApiService.js';
import { rankJobs } from '../services/rankingService.js';
import { getProfile } from './profile.js';

export function registerJobs(router) {
  // GET /api/jobs?q=react&category=software-dev&refresh=1&min=20 (category defaults to all)
  router.get('/api/jobs', async ({ query }) => {
    const profile = getProfile();
    const { jobs, source, cached, warning } = await fetchJobs({
      q: (query.q || '').trim(),
      category: query.category || 'all',
      refresh: query.refresh === '1',
    });

    const min = Math.max(0, Math.min(100, Number(query.min) || 0));
    const ranked = rankJobs(jobs, profile).filter((j) => j.match.score >= min);

    return {
      source,
      cached,
      warning: warning || null,
      profileComplete: Boolean(profile.skills.trim() || profile.target_roles.trim()),
      total: ranked.length,
      jobs: ranked.slice(0, 50),
    };
  });
}
