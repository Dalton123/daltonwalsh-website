import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://daltonwalsh.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
