// Tiny DOM builder. Everything is created with textContent / text nodes (never
// innerHTML), which matters because job descriptions come from an external API.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Like el.replaceChildren(), but skips false/null/undefined and flattens arrays
// (the native version would render them as the text "false" / "[object ...]").
export function setChildren(el, ...children) {
  const nodes = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c))));
  el.replaceChildren(...nodes);
}

export function field(labelText, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, labelText), control, hint && h('div', { class: 'hint' }, hint));
}

let toastTimer;
export function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), isError ? 4500 : 2200);
}
