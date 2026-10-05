import { h, field, toast, setChildren } from '../components/dom.js';
import { api } from '../services/api.js';
import { state } from '../state.js';

export async function CoverLetter() {
  // Pre-filled when arriving from a job card or an application; blank otherwise.
  const job = state.coverLetterJob || { title: '', company: '', description: '' };
  const profile = await api.getProfile();

  const title = h('input', { type: 'text', name: 'title', required: true, maxLength: 200, value: job.title, placeholder: 'e.g. Junior Full-Stack Developer' });
  const company = h('input', { type: 'text', name: 'company', required: true, maxLength: 200, value: job.company, placeholder: 'e.g. Northwind Labs' });
  const description = h('textarea', { name: 'description', rows: 8, placeholder: 'Paste the job description here for a more tailored draft.' }, job.description || '');
  const generateBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Generate opening paragraph');
  const output = h('div', {});

  function showResult(result) {
    const text = h('textarea', { class: 'draft', 'aria-label': 'Cover letter opening paragraph' }, result.text);
    const copyBtn = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(text.value);
            toast('Copied to clipboard');
          } catch {
            text.select();
            toast('Press Ctrl/Cmd+C to copy', true);
          }
        },
      },
      'Copy'
    );
    setChildren(
      output,
      h(
        'div',
        { class: 'card stack', style: 'margin-top:16px' },
        h(
          'div',
          { class: 'row' },
          h('h2', { style: 'margin:0' }, 'Your draft'),
          h('span', { class: 'chip' }, result.source === 'ai' ? `✨ Written by AI (${result.model})` : 'Template draft'),
          h('span', { class: 'spacer' }),
          copyBtn
        ),
        result.warning && h('div', { class: 'notice warn', style: 'margin:0' }, result.warning),
        text,
        h('div', { class: 'hint' }, 'Edit freely. Review it before sending: it only knows what is on your profile.')
      )
    );
  }

  const profileEmpty = !profile.skills.trim() && !profile.summary.trim();

  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        generateBtn.disabled = true;
        generateBtn.textContent = 'Writing…';
        try {
          showResult(await api.generateCoverLetter({ title: title.value, company: company.value, description: description.value }));
        } catch (err) {
          toast(err.message, true);
        } finally {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate opening paragraph';
        }
      },
    },
    h('div', { class: 'grid2' }, field('Job title *', title), field('Company *', company)),
    field('Job description', description, 'Optional, but the draft connects your skills to what the posting asks for.'),
    h('div', { class: 'row' }, generateBtn)
  );

  return h(
    'div',
    {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Cover Letter Assistant'), h('p', { class: 'subtitle' }, 'Draft an opening paragraph tailored to a job and your profile.'))),
    profileEmpty && h('div', { class: 'notice info' }, 'Your profile is empty, so drafts will be generic. Fill in your skills on the ', h('a', { href: '#/profile' }, 'Profile page'), ' first.'),
    form,
    output
  );
}
