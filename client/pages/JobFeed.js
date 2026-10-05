import { h, toast, setChildren } from '../components/dom.js';
import { JobCard } from '../components/JobCard.js';
import { api } from '../services/api.js';
import { state } from '../state.js';

const CATEGORIES = [
  ['software-dev', 'Software development'],
  ['data', 'Data'],
  ['product', 'Product'],
  ['design', 'Design'],
  ['qa', 'QA'],
  ['devops', 'DevOps / sysadmin'],
  ['all', 'All categories'],
];

export async function JobFeed({ navigate }) {
  const root = h('div');
  const results = h('div', { class: 'stack' });

  const search = h('input', { type: 'search', placeholder: 'Search keywords, e.g. react, data analyst', value: state.feed.q, 'aria-label': 'Search jobs' });
  const category = h('select', { 'aria-label': 'Category' }, CATEGORIES.map(([v, label]) => h('option', { value: v }, label)));
  category.value = state.feed.category;
  const refreshBtn = h('button', { class: 'btn', type: 'button', onclick: () => load(true) }, 'Refresh');
  const searchBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Search');

  async function saveJob(job) {
    try {
      await api.createApplication({
        company: job.company,
        role: job.title,
        status: 'wishlist',
        link: job.url,
        notes: job.tags.length ? `Tags: ${job.tags.join(', ')}` : '',
      });
      toast('Saved to your tracker');
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

  async function load(refresh = false) {
    state.feed = { q: search.value.trim(), category: category.value };
    setChildren(results, h('div', { class: 'spinner' }, 'Loading jobs…'));
    searchBtn.disabled = refreshBtn.disabled = true;
    try {
      const data = await api.getJobs({ ...state.feed, refresh });
      setChildren(results, 
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'chip' }, data.source === 'live' ? '● Live postings' : '● Sample postings (offline)'),
          h('span', { class: 'hint' }, `${data.total} result${data.total === 1 ? '' : 's'}, best match first`)
        ),
        data.warning && h('div', { class: 'notice warn' }, data.warning),
        !data.profileComplete &&
          h('div', { class: 'notice info' }, 'Add your skills and target roles on the ', h('a', { href: '#/profile' }, 'Profile page'), ' to get match scores and a personalised ranking.'),
        data.jobs.length === 0
          ? h('div', { class: 'card empty' }, 'No postings found. Try different keywords or category.')
          : data.jobs.map((job) => JobCard({ job, profileComplete: data.profileComplete, onSave: saveJob, onDraft: draftFor }))
      );
    } catch (err) {
      setChildren(results, h('div', { class: 'notice warn' }, err.message));
    } finally {
      searchBtn.disabled = refreshBtn.disabled = false;
    }
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Job Feed'), h('p', { class: 'subtitle' }, 'Real postings, ranked by how well they match your profile.'))),
    h(
      'form',
      {
        class: 'card row',
        style: 'margin-bottom:16px',
        onsubmit: (e) => {
          e.preventDefault();
          load();
        },
      },
      h('div', { style: 'flex:2;min-width:200px' }, search),
      h('div', { style: 'flex:1;min-width:160px' }, category),
      searchBtn,
      refreshBtn
    ),
    results
  );

  load();
  return root;
}
