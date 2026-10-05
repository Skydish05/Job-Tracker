import { h, toast } from './components/dom.js';
import { Dashboard } from './pages/Dashboard.js';
import { ApplicationForm } from './pages/ApplicationForm.js';
import { JobFeed } from './pages/JobFeed.js';
import { CoverLetter } from './pages/CoverLetter.js';
import { Profile } from './pages/Profile.js';

// [pattern, page, nav key]
const routes = [
  [/^#?\/?$/, Dashboard, 'applications'],
  [/^#\/applications\/new$/, ApplicationForm, 'applications'],
  [/^#\/applications\/(?<id>\d+)\/edit$/, ApplicationForm, 'applications'],
  [/^#\/jobs$/, JobFeed, 'jobs'],
  [/^#\/cover-letter$/, CoverLetter, 'cover-letter'],
  [/^#\/profile$/, Profile, 'profile'],
];

const app = document.getElementById('app');
let renderId = 0; // guards against a slow page overwriting a newer navigation

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render() {
  const myId = ++renderId;
  const hash = location.hash || '#/';

  let match = null;
  for (const [pattern, page, navKey] of routes) {
    const m = pattern.exec(hash);
    if (m) {
      match = { page, navKey, params: { ...(m.groups || {}) } };
      break;
    }
  }

  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === match?.navKey));

  if (!match) {
    app.replaceChildren(h('div', { class: 'card empty' }, h('h2', {}, 'Page not found'), h('a', { class: 'btn', href: '#/' }, 'Back to applications')));
    return;
  }

  app.replaceChildren(h('div', { class: 'spinner' }, 'Loading…'));
  try {
    const view = await match.page({ params: match.params, navigate });
    if (myId !== renderId) return;
    app.replaceChildren(view);
    window.scrollTo(0, 0);
  } catch (err) {
    if (myId !== renderId) return;
    console.error(err);
    app.replaceChildren(h('div', { class: 'notice warn' }, `Something went wrong: ${err.message}`));
    toast(err.message, true);
  }
}

window.addEventListener('hashchange', render);
render();
