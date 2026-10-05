// Transparent keyword-overlap ranking: no ML, so every score can be explained
// to the user ("matched: react, sql") and in the demo.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Word-boundary match that also works for skills like "c++", "node.js", "ci/cd".
function containsTerm(text, term) {
  if (!term) return false;
  const re = new RegExp(`(?<![a-z0-9+#])${escapeRegex(term)}(?![a-z0-9+#])`, 'i');
  return re.test(text);
}

export function splitList(value = '') {
  return String(value)
    .split(/[,\n;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const JUNIOR_HINTS = ['junior', 'intern', 'internship', 'entry', 'graduate', 'trainee', 'associate'];
const SENIOR_HINTS = ['senior', 'lead', 'principal', 'staff', 'head of', 'director', 'manager'];

export function scoreJob(job, profile) {
  const skills = splitList(profile.skills);
  const roles = splitList(profile.target_roles);
  const title = job.title.toLowerCase();
  const tags = job.tags.join(' ').toLowerCase();
  const description = job.description.toLowerCase();

  let raw = 0;
  const matchedSkills = [];
  for (const skill of skills) {
    // Tags (2) + description (1) is a full match worth 3 points. Appearing in the
    // title (2) can stand in for a missing tag, but a skill never scores more than 3,
    // so a score of 100 really does mean every skill was found.
    const inTags = containsTerm(tags, skill);
    const inDescription = containsTerm(description, skill);
    const inTitle = containsTerm(title, skill);
    if (inTags || inDescription || inTitle) {
      raw += Math.min(3, (inTags ? 2 : 0) + (inDescription ? 1 : 0) + (inTitle ? 2 : 0));
      matchedSkills.push(skill);
    }
  }

  // A target role counts as matched when all of its words appear in the title.
  const matchedRoles = roles.filter((role) => role.split(/\s+/).every((w) => containsTerm(title, w)));
  if (matchedRoles.length) raw += 6;

  // Experience fit nudges the score; it never goes below zero.
  const level = profile.experience || 'entry';
  const isJuniorRole = JUNIOR_HINTS.some((h) => containsTerm(title, h));
  const isSeniorRole = SENIOR_HINTS.some((h) => containsTerm(title, h));
  let experienceNote = '';
  if ((level === 'entry' || level === 'junior') && isJuniorRole) {
    raw += 2;
    experienceNote = 'Good fit for your experience level';
  } else if ((level === 'entry' || level === 'junior') && isSeniorRole) {
    raw -= 4;
    experienceNote = 'May require more experience than you have';
  } else if ((level === 'mid' || level === 'senior') && isJuniorRole) {
    raw -= 2;
    experienceNote = 'May be below your experience level';
  }

  // Cap the denominator at 5 skills so long skill lists don't flatten every score.
  const denominator = 3 * Math.min(skills.length, 5) + (roles.length ? 6 : 0);
  const score = skills.length || roles.length ? Math.max(0, Math.min(100, Math.round((raw / denominator) * 100))) : 0;

  return { score, matchedSkills, matchedRoles, experienceNote };
}

export function rankJobs(jobs, profile) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, profile) }))
    .sort((a, b) => b.match.score - a.match.score || String(b.postedAt).localeCompare(String(a.postedAt)));
}
