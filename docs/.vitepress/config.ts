import { defineConfig } from 'vitepress';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smaltLight, smaltDark } from './theme/shiki';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = 'https://github.com/stenhoor/smaltbi';
// Served at stenhoor.github.io/smaltbi/ until the site has a domain of its own: then DOCS_BASE is '/'.
const base = process.env.DOCS_BASE ?? '/smaltbi/';
const WORKS = 'https://smaltworks.dev';

export default defineConfig({
  title: 'smaltbi',
  description: 'Business intelligence in the browser, powered by smaltdb.',
  base,
  cleanUrls: true,
  lastUpdated: false,
  // brand/ (copies from stenhoor/smalt-brand) is served from the site root.
  vite: { publicDir: path.resolve(here, '../../brand') },
  // The designer, the viewer and the published sample are deployed beside the site (scripts/site.mjs).
  ignoreDeadLinks: [/designer\.html/, /viewer\.html/, /\/sample\//],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon-32.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
    // Links made for the designer (?report=…) used to point at the site root: forward them.
    ['script', {}, `if (location.pathname === ${JSON.stringify(base)} && /[?&]report=/.test(location.search)) location.replace(${JSON.stringify(base)} + 'designer.html' + location.search + location.hash);`],
  ],
  markdown: {
    theme: { light: smaltLight, dark: smaltDark },
    config(md) {
      // Links that leave docs/ (sources, examples) point at the file on GitHub.
      const fallback = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o));
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href');
        if (href && !/^[a-z]+:|^#|^\//i.test(href) && env?.relativePath) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(env.relativePath), href));
          if (target.startsWith('../')) {
            tokens[idx].attrSet('href', `${REPO}/blob/HEAD/${target.slice(3)}`);
            tokens[idx].attrSet('target', '_blank');
            tokens[idx].attrSet('rel', 'noreferrer');
          }
        }
        return fallback(tokens, idx, options, env, self);
      };
    },
  },
  themeConfig: {
    logo: { light: '/lockup.svg', dark: '/lockup-on-dark.svg', alt: 'smaltbi' },
    siteTitle: false,
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Report format', link: '/REPORT_FORMAT' },
      { text: 'Demo', link: '/designer.html?report=examples/sales/report.json', target: '_self' },
      {
        text: 'smaltworks',
        items: [
          { text: 'The family', link: `${WORKS}/` },
          { text: 'smaltdb: the engine', link: 'https://smaltdb.dev' },
          { text: 'smaltql: SQL', link: 'https://stenhoor.github.io/smaltql/' },
          { text: 'smaltdf: dataframes', link: 'https://stenhoor.github.io/smaltdf/' },
          { text: 'smaltui: SQL console', link: 'https://stenhoor.github.io/smaltui/' },
          { text: 'smaltnb: notebooks', link: 'https://stenhoor.github.io/smaltnb/' },
          { text: 'Work in progress', link: `${WORKS}/stability` },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/' },
          { text: 'Report format', link: '/REPORT_FORMAT' },
          { text: 'Themes', link: '/THEMES' },
          { text: 'Plugins', link: '/PLUGINS' },
        ],
      },
      {
        text: 'Design',
        items: [
          { text: 'Vision', link: '/VISION' },
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'Roadmap', link: '/ROADMAP' },
          { text: 'Open questions', link: '/OPEN_QUESTIONS' },
          { text: 'Decisions (ADRs)', link: '/adr/0001-initial-decisions' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: {
      message: `<a href="${WORKS}/"><img class="sw-light" src="${base}a-smaltworks-project.svg" alt="A smaltworks project" height="28"><img class="sw-dark" src="${base}a-smaltworks-project-on-dark.svg" alt="A smaltworks project" height="28"></a>`,
      copyright: 'MIT License · Built AI-first, by developers, for everyone who creates.',
    },
  },
});
