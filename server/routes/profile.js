import { db } from '../db/db.js';
import { HttpError } from '../router.js';

const EXPERIENCE = ['entry', 'junior', 'mid', 'senior'];

export function getProfile() {
  return db.prepare('SELECT * FROM profile WHERE id = 1').get();
}

export function registerProfile(router) {
  router.get('/api/profile', () => getProfile());

  router.put('/api/profile', ({ body }) => {
    const current = getProfile();
    const next = { ...current };

    for (const field of ['name', 'skills', 'target_roles', 'summary']) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== 'string') throw new HttpError(400, `"${field}" must be a string`);
        next[field] = body[field].trim().slice(0, 2000);
      }
    }
    if (body.experience !== undefined) {
      if (!EXPERIENCE.includes(body.experience)) {
        throw new HttpError(400, `"experience" must be one of: ${EXPERIENCE.join(', ')}`);
      }
      next.experience = body.experience;
    }

    db.prepare(
      `UPDATE profile SET name = @name, skills = @skills, target_roles = @target_roles,
                          experience = @experience, summary = @summary WHERE id = 1`
    ).run({
      name: next.name,
      skills: next.skills,
      target_roles: next.target_roles,
      experience: next.experience,
      summary: next.summary,
    });
    return getProfile();
  });
}
