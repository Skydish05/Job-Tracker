import { h } from './dom.js';

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function relativeDate(iso, label) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return `${label} today`;
  return `${label} ${days} day${days === 1 ? '' : 's'} ago`;
}

export function JobCard({ job, onSave, onDraft }) {
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const postingUrl = safeUrl(job.url);
  const providers = Array.isArray(job.sources) && job.sources.length
    ? job.sources
    : [{ name: job.sourceName, url: job.sourceUrl }];
  const discovered = job.verification === 'search-discovered';
  const stale = job.sourceStatus === 'stale';
  const saveBtn = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      saveBtn.disabled = true;
      const ok = await onSave(job);
      if (ok) saveBtn.textContent = 'Saved ✓';
      else saveBtn.disabled = false;
    },
  }, 'Save to tracker');

  return h('div', { class: 'card item', dataset: { jobId: job.id } },
    h('div', { class: 'item-top' },
      h('div', { style: 'flex:1' },
        h('h3', {}, job.title),
        h('div', { class: 'meta' }, [job.company, job.location, String(job.jobType || '').replaceAll('_', ' '), relativeDate(job.postedAt, 'Posted')].filter(Boolean).join(' · '))
      )
    ),
    h('div', { class: 'row' },
      providers.some((provider) => provider.name) && h('span', { class: 'meta' }, 'Via ', providers.map((provider, index) => {
        const url = safeUrl(provider.url);
        return [index ? ' · ' : '', url
          ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, provider.name)
          : provider.name];
      })),
      discovered && h('span', { class: 'chip', title: 'Found through web search. Open the original posting to confirm that applications are still accepted.' }, 'Check availability'),
      stale ? h('span', { class: 'chip', title: 'The source could not be updated. Open the original posting to confirm availability.' }, 'Older cache · check availability')
        : job.cached && h('span', { class: 'chip', title: 'Loaded from a saved source response. See source status for update details.' }, 'Cached'),
      job.discoveredAt && h('span', { class: 'meta', title: new Date(job.discoveredAt).toLocaleString() }, relativeDate(job.discoveredAt, discovered ? 'Found' : 'Retrieved'))
    ),
    tags.length > 0 && h('div', { class: 'chips' }, tags.map((tag) => h('span', { class: 'chip' }, tag))),
    h('div', { class: 'row' },
      saveBtn,
      h('button', { class: 'btn small', type: 'button', onclick: () => onDraft(job) }, 'Draft cover letter'),
      h('span', { class: 'spacer' }),
      postingUrl && h('a', { class: 'btn small', href: postingUrl, target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗')
    )
  );
}
