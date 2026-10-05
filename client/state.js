// Small shared state so pages can hand data to each other (e.g. "Draft cover
// letter" on a job pre-fills the Cover Letter page).
export const state = {
  coverLetterJob: null,
  feed: { q: '', category: 'all' },
};
