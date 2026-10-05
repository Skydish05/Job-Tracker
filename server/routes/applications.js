import { db, STATUSES } from '../db/db.js';
import { HttpError } from '../router.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(body, { partial = false } = {}) {
  const out = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : v);

  for (const field of ['company', 'role']) {
    if (body[field] !== undefined || !partial) {
      const v = str(body[field]);
      if (!v || typeof v !== 'string') throw new HttpError(400, `"${field}" is required`);
      out[field] = v.slice(0, 200);
    }
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}`);
    }
    out.status = body.status;
  }
  if (body.deadline !== undefined) {
    const v = str(body.deadline) || null;
    if (v && !ISO_DATE.test(v)) throw new HttpError(400, '"deadline" must be YYYY-MM-DD');
    out.deadline = v;
  }
  for (const field of ['link', 'notes']) {
    if (body[field] !== undefined) {
      const v = str(body[field]);
      out[field] = v ? String(v).slice(0, 2000) : null;
    }
  }
  return out;
}

function getOr404(id) {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(id));
  if (!row) throw new HttpError(404, 'Application not found');
  return row;
}

export function registerApplications(router) {
  router.get('/api/applications', ({ query }) => {
    if (query.status) {
      if (!STATUSES.includes(query.status)) throw new HttpError(400, 'Unknown status filter');
      return db
        .prepare('SELECT * FROM applications WHERE status = ? ORDER BY updated_at DESC, id DESC')
        .all(query.status);
    }
    return db.prepare('SELECT * FROM applications ORDER BY updated_at DESC, id DESC').all();
  });

  router.get('/api/applications/:id', ({ params }) => getOr404(params.id));

  router.post('/api/applications', ({ body }) => {
    const data = clean(body);
    // Saving the same posting twice (e.g. from the job feed after a reload)
    // returns the existing row instead of creating a copy.
    if (data.link) {
      const existing = db.prepare('SELECT * FROM applications WHERE link = ? ORDER BY id LIMIT 1').get(data.link);
      if (existing) return { ...existing, duplicate: true };
    }
    const result = db
      .prepare(
        `INSERT INTO applications (company, role, status, deadline, link, notes)
         VALUES (@company, @role, @status, @deadline, @link, @notes)`
      )
      .run({
        company: data.company,
        role: data.role,
        status: data.status ?? 'applied',
        deadline: data.deadline ?? null,
        link: data.link ?? null,
        notes: data.notes ?? null,
      });
    return getOr404(result.lastInsertRowid);
  });

  router.put('/api/applications/:id', ({ params, body }) => {
    const existing = getOr404(params.id);
    const data = clean(body, { partial: true });
    const merged = { ...existing, ...data };
    db.prepare(
      `UPDATE applications
          SET company = @company, role = @role, status = @status, deadline = @deadline,
              link = @link, notes = @notes, updated_at = datetime('now')
        WHERE id = @id`
    ).run({
      id: existing.id,
      company: merged.company,
      role: merged.role,
      status: merged.status,
      deadline: merged.deadline,
      link: merged.link,
      notes: merged.notes,
    });
    return getOr404(existing.id);
  });

  router.delete('/api/applications/:id', ({ params }) => {
    const existing = getOr404(params.id);
    db.prepare('DELETE FROM applications WHERE id = ?').run(existing.id);
    return undefined;
  });
}
