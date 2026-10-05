async function request(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listApplications: () => request('GET', '/applications'),
  getApplication: (id) => request('GET', `/applications/${id}`),
  createApplication: (data) => request('POST', '/applications', data),
  updateApplication: (id, data) => request('PUT', `/applications/${id}`, data),
  deleteApplication: (id) => request('DELETE', `/applications/${id}`),

  getProfile: () => request('GET', '/profile'),
  saveProfile: (data) => request('PUT', '/profile', data),

  getJobs: ({ q = '', category = 'software-dev', refresh = false } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (refresh) params.set('refresh', '1');
    return request('GET', `/jobs?${params}`);
  },

  generateCoverLetter: (job) => request('POST', '/cover-letter', { job }),
};
