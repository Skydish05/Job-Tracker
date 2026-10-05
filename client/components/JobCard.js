import { h } from './dom.js';

function postedText(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'Posted today';
  return `Posted ${days} day${days === 1 ? '' : 's'} ago`;
}

export function JobCard({ job, profileComplete, onSave, onDraft }) {
  const { score, matchedSkills, experienceNote } = job.match;
  // Tags already shown as green "matched" chips would just repeat themselves.
  const otherTags = job.tags.filter((t) => !matchedSkills.includes(t));
  const saveBtn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        saveBtn.disabled = true;
        const ok = await onSave(job);
        if (ok) saveBtn.textContent = 'Saved ✓';
        else saveBtn.disabled = false;
      },
    },
    'Save to tracker'
  );

  return h(
    'div',
    { class: 'card item', dataset: { jobId: job.id } },
    h(
      'div',
      { class: 'item-top' },
      h(
        'div',
        { style: 'flex:1' },
        h('h3', {}, job.title),
        h('div', { class: 'meta' }, [job.company, job.location, job.jobType.replace('_', ' '), postedText(job.postedAt)].filter(Boolean).join(' · '))
      ),
      profileComplete &&
        h(
          'div',
          { class: 'match-meter', title: 'How well this posting matches your profile' },
          h('div', { class: 'pct' }, `${score}%`),
          h('div', { class: 'bar' }, h('span', { style: `width:${score}%` })),
          h('div', { class: 'label' }, 'match')
        )
    ),
    matchedSkills.length > 0 &&
      h('div', { class: 'chips' }, matchedSkills.map((s) => h('span', { class: 'chip match' }, `✓ ${s}`))),
    experienceNote && h('div', { class: 'meta' }, experienceNote),
    otherTags.length > 0 && h('div', { class: 'chips' }, otherTags.slice(0, 8).map((t) => h('span', { class: 'chip' }, t))),
    h(
      'div',
      { class: 'row' },
      saveBtn,
      h('button', { class: 'btn small', type: 'button', onclick: () => onDraft(job) }, 'Draft cover letter'),
      h('span', { class: 'spacer' }),
      job.url && h('a', { class: 'btn small', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗')
    )
  );
}
