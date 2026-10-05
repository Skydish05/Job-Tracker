import { HttpError } from '../router.js';
import { generateCoverLetter } from '../services/llmService.js';
import { getProfile } from './profile.js';

export function registerCoverLetter(router) {
  // POST /api/cover-letter  { job: { title, company, description? } }
  router.post('/api/cover-letter', async ({ body }) => {
    const job = body.job || {};
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const company = typeof job.company === 'string' ? job.company.trim() : '';
    if (!title || !company) throw new HttpError(400, 'job.title and job.company are required');

    return generateCoverLetter(getProfile(), {
      title: title.slice(0, 200),
      company: company.slice(0, 200),
      description: typeof job.description === 'string' ? job.description : '',
    });
  });
}
