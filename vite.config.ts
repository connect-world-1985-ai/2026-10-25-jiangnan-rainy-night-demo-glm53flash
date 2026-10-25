import { defineConfig } from 'vite';

// On GitHub Actions, GITHUB_REPOSITORY is "owner/repo"; the Pages site is
// served from /<repo>/, so set the base accordingly. Locally we use '/'.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const base = process.env.VITE_BASE || (repoName ? `/${repoName}/` : '/');

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
