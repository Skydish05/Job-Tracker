import { db } from '../db/db.js';

export const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;

export const jobRepository = {
  readSource(id) {
    const row = db.prepare('SELECT * FROM job_source_cache WHERE source_id = ?').get(id);
    if (!row) return null;
    try {
      const jobs = JSON.parse(row.jobs_json);
      return Array.isArray(jobs) ? { jobs, fetchedAt: row.fetched_at } : null;
    } catch { return null; }
  },
  writeSource(id, jobs, fetchedAt) {
    db.prepare(`INSERT INTO job_source_cache (source_id, jobs_json, fetched_at) VALUES (?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET jobs_json = excluded.jobs_json, fetched_at = excluded.fetched_at`)
      .run(id, JSON.stringify(jobs), fetchedAt);
  },
  saveDiscoveries(jobs, now = Date.now()) {
    const insert = db.prepare(`INSERT INTO discovered_jobs (url, job_json, discovered_at) VALUES (?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET job_json = excluded.job_json, discovered_at = excluded.discovered_at`);
    db.exec('BEGIN');
    try {
      for (const job of jobs) {
        const discoveredAt = Date.parse(job.discoveredAt);
        insert.run(job.url, JSON.stringify(job), Number.isFinite(discoveredAt) ? Math.min(discoveredAt, now) : now);
      }
      db.prepare('DELETE FROM discovered_jobs WHERE discovered_at < ?').run(now - DISCOVERY_TTL_MS);
      db.exec('DELETE FROM discovered_jobs WHERE url NOT IN (SELECT url FROM discovered_jobs ORDER BY discovered_at DESC LIMIT 1000)');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
  readDiscoveries(now = Date.now()) {
    db.prepare('DELETE FROM discovered_jobs WHERE discovered_at < ?').run(now - DISCOVERY_TTL_MS);
    return db.prepare('SELECT job_json FROM discovered_jobs ORDER BY discovered_at DESC').all()
      .flatMap((row) => {
        try { return [JSON.parse(row.job_json)]; } catch { return []; }
      });
  },
};
