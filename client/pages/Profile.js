import { h, field, toast } from '../components/dom.js';
import { api } from '../services/api.js';

const LEVELS = [
  ['entry', 'Entry level / student'],
  ['junior', 'Junior (1-2 years)'],
  ['mid', 'Mid-level (3-5 years)'],
  ['senior', 'Senior (6+ years)'],
];

export async function Profile() {
  const profile = await api.getProfile();

  const name = h('input', { type: 'text', name: 'name', value: profile.name, maxLength: 200, placeholder: 'Your name' });
  const skills = h('textarea', { name: 'skills', rows: 3, placeholder: 'react, sql, python, node.js' }, profile.skills);
  const roles = h('textarea', { name: 'target_roles', rows: 2, placeholder: 'junior developer, data analyst' }, profile.target_roles);
  const level = h('select', { name: 'experience' }, LEVELS.map(([v, label]) => h('option', { value: v }, label)));
  level.value = profile.experience;
  const summary = h('textarea', { name: 'summary', rows: 4, placeholder: 'A few sentences about you: major, projects, what you are looking for. The cover letter draft only uses facts written here.' }, profile.summary);
  const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save profile');

  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        try {
          await api.saveProfile({
            name: name.value,
            skills: skills.value,
            target_roles: roles.value,
            experience: level.value,
            summary: summary.value,
          });
          toast('Profile saved');
        } catch (err) {
          toast(err.message, true);
        } finally {
          saveBtn.disabled = false;
        }
      },
    },
    h('div', { class: 'grid2' }, field('Name', name), field('Experience level', level)),
    field('Skills', skills, 'Comma-separated. These drive the match score in the Job Feed.'),
    field('Target roles', roles, 'Comma-separated. A job whose title contains all words of a role gets a boost.'),
    field('About you', summary),
    h('div', { class: 'row' }, saveBtn)
  );

  return h(
    'div',
    {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Profile'), h('p', { class: 'subtitle' }, 'Used to rank job postings and to write your cover letter drafts.'))),
    form
  );
}
