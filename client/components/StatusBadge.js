import { h } from './dom.js';

export const STATUSES = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];

export function StatusBadge(status) {
  return h('span', { class: `badge ${status}` }, status);
}
