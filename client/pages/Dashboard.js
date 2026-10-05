import { h, toast, setChildren } from '../components/dom.js';
import { ApplicationCard } from '../components/ApplicationCard.js';
import { STATUSES } from '../components/StatusBadge.js';
import { api } from '../services/api.js';
import { state } from '../state.js';

export async function Dashboard({ navigate }) {
  let apps = await api.listApplications();
  let filter = 'all';
  const root = h('div');

  async function changeStatus(app, status) {
    try {
      const updated = await api.updateApplication(app.id, { status });
      apps = apps.map((a) => (a.id === app.id ? updated : a));
      toast(`Moved to ${status}`);
      render();
    } catch (err) {
      toast(err.message, true);
      render();
    }
  }

  async function remove(app) {
    try {
      await api.deleteApplication(app.id);
      apps = apps.filter((a) => a.id !== app.id);
      toast('Application deleted');
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function draft(app) {
    state.coverLetterJob = { title: app.role, company: app.company, description: app.notes || '' };
    navigate('#/cover-letter');
  }

  function render() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]));
    const visible = filter === 'all' ? apps : apps.filter((a) => a.status === filter);

    const pill = (key, label, count) =>
      h(
        'button',
        {
          class: `pill${filter === key ? ' active' : ''}`,
          type: 'button',
          dataset: { filter: key },
          onclick: () => {
            filter = key;
            render();
          },
        },
        label,
        h('b', {}, count)
      );

    setChildren(root, 
      h(
        'div',
        { class: 'page-head' },
        h('div', {}, h('h1', {}, 'Applications'), h('p', { class: 'subtitle' }, 'Every role you are tracking, in one place.')),
        h('a', { class: 'btn primary', href: '#/applications/new' }, '+ Add application')
      ),
      apps.length > 0 &&
        h(
          'div',
          { class: 'filters' },
          pill('all', 'All', apps.length),
          STATUSES.map((s) => pill(s, s[0].toUpperCase() + s.slice(1), counts[s]))
        ),
      apps.length === 0
        ? h(
            'div',
            { class: 'card empty' },
            h('h2', {}, 'No applications yet'),
            h('p', {}, 'Add one by hand, or browse the Job Feed and save postings you like.'),
            h(
              'div',
              { class: 'row', style: 'justify-content:center' },
              h('a', { class: 'btn primary', href: '#/applications/new' }, 'Add application'),
              h('a', { class: 'btn', href: '#/jobs' }, 'Browse job feed')
            )
          )
        : visible.length === 0
          ? h('div', { class: 'card empty' }, `Nothing with status "${filter}".`)
          : h(
              'div',
              { class: 'stack' },
              visible.map((app) => ApplicationCard({ app, onStatusChange: changeStatus, onDelete: remove, onDraft: draft }))
            )
    );
  }

  render();
  return root;
}
