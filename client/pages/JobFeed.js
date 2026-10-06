import { h, field, toast, setChildren } from '../components/dom.js';
import { JobCard } from '../components/JobCard.js';
import { api } from '../services/api.js';
import { state } from '../state.js';

const CATEGORIES = [
  ['all', 'All categories'],
  ['software-dev', 'Software development'],
  ['data', 'Data'],
  ['product', 'Product'],
  ['design', 'Design'],
  ['qa', 'QA'],
  ['devops', 'DevOps / sysadmin'],
];
const SOURCES = [
  ['all', 'All sources'],
  ['remotive', 'Remotive'],
  ['arbeitnow', 'Arbeitnow'],
  ['remoteok', 'Remote OK'],
  ['web', 'Web discoveries'],
  ['linkedin', 'LinkedIn (web search)'],
  ['indeed', 'Indeed (web search)'],
];
const SEARCH_TARGETS = [
  ['all', 'Entire web'],
  ['company', 'Company career sites (ATS)'],
  ['linkedin', 'LinkedIn'],
  ['indeed', 'Indeed'],
];
const REGIONS = [
  ['all', 'All regions'],
  ['seoul', 'Seoul / 서울'],
  ['north-america', 'North America / 북미'],
  ['europe', 'Europe / 유럽'],
  ['singapore', 'Singapore / 싱가폴'],
  ['hong-kong', 'Hong Kong / 홍콩'],
];
const SOURCE_STATUS = { fresh: 'Updated', cached: 'Cached', stale: 'Older cache', error: 'Unavailable' };
let feedGeneration = 0;

function externalLink(url, label) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return label;
    return h('a', { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' }, label);
  } catch {
    return label;
  }
}

function updatedText(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? `Updated ${date.toLocaleString()}` : '';
}

export async function JobFeed({ navigate }) {
  const viewGeneration = ++feedGeneration;
  const root = h('div');
  const results = h('div', { class: 'stack', 'aria-live': 'polite' });
  const discoveryResults = h('div', { class: 'stack', 'aria-live': 'polite' });
  const discoveryHint = h('div', { class: 'hint' }, 'Checking web search availability…');
  const cards = h('div', { class: 'stack' });
  const loadError = h('div', { role: 'status' });
  let generation = 0;
  let feedLoading = false;
  let discovering = false;
  let discoveryEnabled = false;
  let lastData = null;
  let shownJobs = [];
  let nextOffset = 0;

  const search = h('input', { type: 'search', placeholder: 'React, data analyst…', value: state.feed.q, maxLength: 300 });
  const region = h('select', {}, REGIONS.map(([value, label]) => h('option', { value }, label)));
  region.value = state.feed.region || 'all';
  const category = h('select', {}, CATEGORIES.map(([v, label]) => h('option', { value: v }, label)));
  category.value = state.feed.category;
  const source = h('select', {}, SOURCES.map(([v, label]) => h('option', { value: v }, label)));
  source.value = state.feed.source || 'all';
  const target = h('select', {
    onchange: (event) => { state.discoveryTarget = event.target.value; },
  }, SEARCH_TARGETS.map(([value, label]) => h('option', { value }, label)));
  target.value = state.discoveryTarget || 'all';
  const refreshBtn = h('button', { class: 'btn', type: 'button', onclick: () => load(true) }, 'Refresh feeds');
  const searchBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Filter jobs');
  const moreBtn = h('button', { class: 'btn', type: 'button', onclick: () => load(false, true) }, 'Load more');
  const discoveryBtn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: discover }, 'Search the web with AI');

  function setBusy() {
    const busy = feedLoading || discovering;
    for (const control of [search, region, category, source, target, searchBtn, refreshBtn, moreBtn]) control.disabled = busy;
    discoveryBtn.disabled = busy || !discoveryEnabled;
    discoveryBtn.textContent = discovering ? 'Searching the web…' : 'Search the web with AI';
    moreBtn.textContent = feedLoading ? 'Loading…' : 'Load more';
    results.setAttribute('aria-busy', String(feedLoading));
    discoveryResults.setAttribute('aria-busy', String(discovering));
  }

  function filters() {
    return { q: search.value.trim(), category: category.value, region: region.value, source: source.value };
  }

  async function saveJob(job) {
    try {
      const saved = await api.createApplication({
        company: job.company,
        role: job.title,
        status: 'wishlist',
        link: job.url,
        notes: job.tags?.length ? `Tags: ${job.tags.join(', ')}` : '',
      });
      toast(saved.duplicate ? 'Already in your tracker' : 'Saved to your tracker');
      return true;
    } catch (err) {
      toast(err.message, true);
      return false;
    }
  }

  function draftFor(job) {
    state.coverLetterJob = { title: job.title, company: job.company, description: job.description };
    navigate('#/cover-letter');
  }

  function renderResults(data) {
    const available = data.totalAvailable ?? data.total;
    setChildren(results,
      h('div', { class: 'row' },
        h('strong', {}, `${data.total} job${data.total === 1 ? '' : 's'}`),
        h('span', { class: 'hint' }, `Showing ${shownJobs.length} · ${available} available across sources · Newest postings first`)
      ),
      data.sources?.length > 0 && h('details', { class: 'feed-sources' },
        h('summary', {}, 'Sources and update status'),
        h('div', { class: 'stack' }, data.sources.map((provider) => h('div', { class: 'row' },
          h('span', {}, externalLink(provider.url, provider.name)),
          h('span', { class: 'chip', title: updatedText(provider.updatedAt) }, SOURCE_STATUS[provider.status] || provider.status),
          h('span', { class: 'hint' }, `${provider.count} posting${provider.count === 1 ? '' : 's'}`),
          provider.updatedAt && h('span', { class: 'hint' }, updatedText(provider.updatedAt)),
          provider.error && h('span', { class: 'hint' }, provider.error)
        )))
      ),
      data.warning && h('div', { class: 'notice warn' }, data.warning),
      shownJobs.length ? cards : h('div', { class: 'card empty' },
        h('h2', {}, available ? 'No jobs match these filters' : 'No job postings available'),
        h('p', {}, available ? 'Try broader keywords, another location or all sources.' : 'Check the source status above and try again. Web search can discover additional postings.')
      ),
      loadError,
      data.hasMore && h('div', { class: 'row feed-more' }, moreBtn)
    );
  }

  async function load(refresh = false, append = false) {
    if (feedLoading || discovering) return;
    const requestId = ++generation;
    const activeFilters = append ? { ...state.feed } : filters();
    if (!append) state.feed = activeFilters;
    feedLoading = true;
    setBusy();
    setChildren(loadError);
    if (!append) setChildren(results, h('div', { class: 'spinner' }, 'Loading job sources…'));
    try {
      const data = await api.getJobs({ ...activeFilters, refresh, offset: append ? nextOffset : 0, limit: 25 });
      if (requestId !== generation || viewGeneration !== feedGeneration) return;
      discoveryEnabled = Boolean(data.discovery?.enabled);
      discoveryHint.textContent = discoveryEnabled
        ? 'Search uses your keywords and region above, or your profile if keywords are blank. Category and source filters apply to the feed only.'
        : 'Set TAVILY_API_KEY and GEMINI_API_KEY on the server to enable web search.';
      if (!append) {
        shownJobs = [];
        setChildren(cards);
      }
      const seen = new Set(shownJobs.map((job) => `${job.sourceId}:${job.id}`));
      for (const job of data.jobs) {
        const key = `${job.sourceId}:${job.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        shownJobs.push(job);
        cards.append(JobCard({ job, onSave: saveJob, onDraft: draftFor }));
      }
      nextOffset = data.offset + data.jobs.length;
      lastData = { ...data, hasMore: data.hasMore && data.jobs.length > 0 };
      renderResults(lastData);
    } catch (err) {
      if (requestId !== generation || viewGeneration !== feedGeneration) return;
      if (append) setChildren(loadError, h('div', { class: 'notice warn' }, err.message));
      else setChildren(results, h('div', { class: 'notice warn' }, err.message));
      if (!lastData) discoveryHint.textContent = 'Could not check web search availability. Refresh the feeds to retry.';
    } finally {
      if (requestId === generation && viewGeneration === feedGeneration) {
        feedLoading = false;
        setBusy();
      }
    }
  }

  async function discover() {
    if (feedLoading || discovering || !discoveryEnabled) return;
    discovering = true;
    setBusy();
    const request = { q: search.value.trim(), region: region.value, target: target.value };
    state.discoveryTarget = request.target;
    const targetLabel = SEARCH_TARGETS.find(([value]) => value === request.target)?.[1] || 'Entire web';
    setChildren(discoveryResults, h('div', { class: 'spinner' }, `Searching public job pages: ${targetLabel}…`));
    let reload = false;
    try {
      const data = await api.discoverJobs(request);
      if (viewGeneration !== feedGeneration) return;
      const count = data.jobs.length;
      setChildren(discoveryResults,
        h('div', { class: 'notice info' },
          h('strong', {}, `${count} job candidate${count === 1 ? '' : 's'} found`),
          h('div', {}, [targetLabel, request.q || 'Based on your profile', REGIONS.find(([value]) => value === request.region)?.[1]].filter(Boolean).join(' · ')),
          h('div', {}, count ? 'Open the original postings to confirm availability. Saved web discoveries matching your selected region appear below; use the filters to narrow them.' : 'No job postings could be extracted from this search. Try a more specific role or a broader location.')
        ),
        data.warning && h('div', { class: 'notice warn' }, data.warning),
        data.sources?.length > 0 && h('details', { class: 'feed-sources' },
          h('summary', {}, 'Search sources'),
          h('ul', {}, data.sources.map((item) => h('li', {}, externalLink(item.url, item.title || item.url))))
        )
      );
      if (count > 0) {
        search.value = '';
        category.value = 'all';
        source.value = ['linkedin', 'indeed'].includes(request.target) ? request.target : 'web';
        reload = true;
      }
    } catch (err) {
      if (viewGeneration !== feedGeneration) return;
      setChildren(discoveryResults, h('div', { class: 'notice warn' }, err.message));
    } finally {
      discovering = false;
      setBusy();
    }
    if (reload && viewGeneration === feedGeneration) await load();
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Job Feed'), h('p', { class: 'subtitle' }, 'Browse multiple job boards and discover more opportunities with web search.'))),
    h('form', {
      class: 'card feed-filters',
      onsubmit: (event) => { event.preventDefault(); load(); },
    },
      h('div', { class: 'grid2' }, field('Keywords', search), field('Region / 지역', region)),
      h('div', { class: 'grid2' }, field('Category', category), field('Source', source)),
      h('div', { class: 'row' }, searchBtn, refreshBtn),
      h('div', { class: 'hint' }, 'Refresh checks source caches; provider refresh limits still apply. Confirm availability on the original posting.')
    ),
    h('div', { class: 'card stack feed-discovery' },
      h('div', {}, h('h2', {}, 'Go beyond the feeds'),
        field('Web search target', target, 'Searches publicly indexed job pages; some listings may require sign-in to view or apply.'),
        h('div', { class: 'row' }, discoveryBtn), discoveryHint),
      h('div', { class: 'hint' }, 'On click, your keywords, region, profile skills, target roles and experience are used to build Tavily searches and sent with public search results to Gemini. Your name and bio are excluded. API charges may apply.'),
      discoveryResults
    ),
    results
  );

  load();
  return root;
}
