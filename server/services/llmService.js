// Cover letter opening paragraph.
// With GEMINI_API_KEY set it asks Gemini; without a key (or if the call
// fails) it returns a clearly labelled template draft so the feature still
// works offline in a demo.

const API_BASE = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const API_URL = `${API_BASE}/models/${MODEL}:generateContent`;

export function buildPrompt(profile, job) {
  const lines = [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    job.description ? `Job description:\n${job.description.slice(0, 3000)}` : 'Job description: (not provided)',
    '',
    'Candidate profile:',
    `Name: ${profile.name || '(not provided)'}`,
    `Experience level: ${profile.experience}`,
    `Skills: ${profile.skills || '(not provided)'}`,
    `Target roles: ${profile.target_roles || '(not provided)'}`,
    `About: ${profile.summary || '(not provided)'}`,
  ];
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You write the opening paragraph of a cover letter.',
  'Write 80-120 words in the first person, in a confident but natural tone.',
  'Connect the candidate\'s real skills to what this specific job asks for, and mention the company by name.',
  'Use ONLY facts from the candidate profile. Never invent employers, degrees, projects, numbers or achievements.',
  'If the profile is thin, stay general about experience and focus on motivation and the skills that are listed.',
  'Output only the paragraph: no greeting, no sign-off, no placeholders in brackets, no commentary.',
].join(' ');

export function templateDraft(profile, job) {
  const skills = profile.skills
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const skillText = skills.length
    ? `my background in ${skills.slice(0, -1).join(', ')}${skills.length > 1 ? ' and ' : ''}${skills[skills.length - 1]}`
    : 'my technical background';
  const levelText =
    { entry: 'an early-career candidate', junior: 'a junior professional', mid: 'an experienced professional', senior: 'a senior professional' }[
      profile.experience
    ] || 'a motivated candidate';
  const intro = profile.name ? `My name is ${profile.name}, and I am` : 'I am';

  return (
    `${intro} writing to apply for the ${job.title} position at ${job.company}. ` +
    `As ${levelText}, I was drawn to this role because ${skillText} lines up closely with what the position involves. ` +
    `${profile.summary ? profile.summary.trim().replace(/\s+/g, ' ') + ' ' : ''}` +
    `I would welcome the chance to contribute to ${job.company} and to keep growing alongside your team.`
  );
}

export async function generateCoverLetter(profile, job) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      text: templateDraft(profile, job),
      source: 'template',
      warning: 'No GEMINI_API_KEY set, so this is a template draft rather than an AI-written one.',
    };
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(profile, job) }] }],
        // Generous limit: on thinking models the budget also covers reasoning tokens.
        generationConfig: { maxOutputTokens: 2000 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    if (!text) throw new Error('Empty response from model');
    return { text, source: 'ai', model: MODEL, warning: null };
  } catch (err) {
    console.error('Cover letter AI call failed:', err.message);
    return {
      text: templateDraft(profile, job),
      source: 'template',
      warning: `AI request failed (${err.message}). Showing a template draft instead.`,
    };
  }
}
