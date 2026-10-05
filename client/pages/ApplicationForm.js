import { h, field, toast } from '../components/dom.js';
import { STATUSES } from '../components/StatusBadge.js';
import { api } from '../services/api.js';

export async function ApplicationForm({ params, navigate }) {
  const editing = Boolean(params.id);
  const app = editing ? await api.getApplication(params.id) : { company: '', role: '', status: 'applied', deadline: '', link: '', notes: '' };

  const company = h('input', { type: 'text', name: 'company', required: true, maxLength: 200, value: app.company, placeholder: 'e.g. LG Electronics' });
  const role = h('input', { type: 'text', name: 'role', required: true, maxLength: 200, value: app.role, placeholder: 'e.g. Junior Software Engineer' });
  const status = h('select', { name: 'status' }, STATUSES.map((s) => h('option', { value: s }, s)));
  status.value = app.status;
  const deadline = h('input', { type: 'date', name: 'deadline', value: app.deadline || '' });
  const link = h('input', { type: 'url', name: 'link', value: app.link || '', placeholder: 'https://...' });
  const notes = h('textarea', { name: 'notes', rows: 4, placeholder: 'Recruiter name, interview dates, anything to remember. Also used as context for the cover letter draft.' }, app.notes || '');

  const submit = h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Save changes' : 'Add application');

  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        const payload = {
          company: company.value,
          role: role.value,
          status: status.value,
          deadline: deadline.value,
          link: link.value,
          notes: notes.value,
        };
        try {
          if (editing) await api.updateApplication(app.id, payload);
          else await api.createApplication(payload);
          toast(editing ? 'Changes saved' : 'Application added');
          navigate('#/');
        } catch (err) {
          toast(err.message, true);
          submit.disabled = false;
        }
      },
    },
    h('div', { class: 'grid2' }, field('Company *', company), field('Role *', role)),
    h('div', { class: 'grid2' }, field('Status', status), field('Deadline', deadline)),
    field('Posting link', link),
    field('Notes', notes),
    h('div', { class: 'row' }, submit, h('a', { class: 'btn', href: '#/' }, 'Cancel'))
  );

  return h('div', {}, h('div', { class: 'page-head' }, h('h1', {}, editing ? 'Edit application' : 'Add application')), form);
}
