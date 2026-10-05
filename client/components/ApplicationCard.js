import { h } from './dom.js';
import { StatusBadge, STATUSES } from './StatusBadge.js';

function dueInfo(app) {
  if (!app.deadline || app.status === 'offer' || app.status === 'rejected') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${app.deadline}T00:00:00`) - today) / 86_400_000);
  const plural = (n) => `${n} day${n === 1 ? '' : 's'}`;
  if (days < 0) return { text: `Overdue by ${plural(-days)}`, cls: 'overdue' };
  if (days === 0) return { text: 'Due today', cls: 'soon' };
  if (days <= 7) return { text: `Due in ${plural(days)}`, cls: 'soon' };
  return { text: `Deadline ${app.deadline}`, cls: '' };
}

export function ApplicationCard({ app, onStatusChange, onDelete, onDraft }) {
  const due = dueInfo(app);

  const statusSelect = h(
    'select',
    {
      'aria-label': `Status for ${app.role} at ${app.company}`,
      style: 'width:auto',
      onchange: (e) => onStatusChange(app, e.target.value),
    },
    STATUSES.map((s) => h('option', { value: s, selected: s === app.status }, s))
  );

  const deleteBtn = h(
    'button',
    {
      class: 'btn small danger',
      type: 'button',
      onclick: () => {
        // Two-step delete instead of a native confirm() dialog.
        if (deleteBtn.dataset.armed) return onDelete(app);
        deleteBtn.dataset.armed = '1';
        deleteBtn.textContent = 'Click again to confirm';
        setTimeout(() => {
          delete deleteBtn.dataset.armed;
          deleteBtn.textContent = 'Delete';
        }, 3000);
      },
    },
    'Delete'
  );

  return h(
    'div',
    { class: 'card item', dataset: { id: app.id } },
    h(
      'div',
      { class: 'item-top' },
      h('div', { style: 'flex:1' }, h('h3', {}, app.role), h('div', { class: 'meta' }, app.company)),
      StatusBadge(app.status)
    ),
    h(
      'div',
      { class: 'row' },
      due && h('span', { class: `due ${due.cls}` }, due.text),
      app.link && h('a', { class: 'meta', href: app.link, target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗')
    ),
    app.notes && h('div', { class: 'notes' }, app.notes),
    h(
      'div',
      { class: 'row' },
      statusSelect,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', type: 'button', onclick: () => onDraft(app) }, 'Draft cover letter'),
      h('a', { class: 'btn small', href: `#/applications/${app.id}/edit` }, 'Edit'),
      deleteBtn
    )
  );
}
