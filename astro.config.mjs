// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages：https://wila150.github.io/boxing-timer/
export default defineConfig({
  site: 'https://wila150.github.io',
  base: '/boxing-timer',
  trailingSlash: 'ignore',
  vite: { plugins: [tailwindcss()] },
});
