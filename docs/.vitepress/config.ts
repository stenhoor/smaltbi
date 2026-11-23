import { defineConfig } from 'vitepress';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smaltLight, smaltDark } from './theme/shiki';
import { smaltworksMenu, smaltworksFooter } from './theme/smaltworks';
import { agentDocs, packageVersion } from './theme/agents';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = 'https://github.com/stenhoor/smaltbi';
// Served at stenhoor.github.io/smaltbi/ until the site has a domain of its own: then DOCS_BASE is '/'.
const base = process.env.DOCS_BASE ?? '/smaltbi/';
const WORKS = 'https://smaltworks.dev';

// The report format, a page per section, in the order of its index page.
const FORMAT = [
  ['Data', 'data'],
  ['Model', 'model'],
  ['Formats', 'formats'],
  ['Pages', 'pages'],
  ['Visuals', 'visuals'],
  ['Repeat for each', 'repeat'],
  ['Conditional formatting', 'conditional'],
  ['Chart axes', 'axes'],
  ['Filters', 'filters'],
  ['Bookmarks and view state', 'bookmarks'],
].map(([text, page]) => ({ text, link: `/reference/format/${page}` }));
// The report format was one page, /REPORT_FORMAT: its links (served the 404 page, which runs this) go to the section's
// page now.
const FORMAT_MOVED: Record<string, string> = {
  '': '', data: 'data', model: 'model', formats: 'formats', 'pages-and-visuals': 'pages', 'visual-types-and-roles': 'visuals#visual-types-and-roles',
  filters: 'filters', 'bookmarks-and-view-state': 'bookmarks', compatibility: '#compatibility',
};

// The visual types' pages are generated from the visual registry (npm run docs:visuals); the sidebar follows their
// index, group by group, so the two cannot disagree.
function visualGroups() {
  const index = readFileSync(path.resolve(here, '../reference/visuals/index.md'), 'utf8');
  const groups: { text: string; collapsed: boolean; items: { text: string; link: string }[] }[] = [];
  for (const line of index.split('\n')) {
    const head = /^## (.+)$/.exec(line);
    if (head) groups.push({ text: head[1], collapsed: true, items: [] });
    const row = /^\| \[`([\w-]+)`\]\(\.\/[\w-]+\) \| ([^|]+) \|/.exec(line);
    if (row && groups.length) groups[groups.length - 1].items.push({ text: row[2].trim(), link: `/reference/visuals/${row[1]}` });
  }
  return groups;
}

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
  // Docs for agents (BRAND.md, Documentation, rule 9): a Markdown twin of every page, /llms.txt and /agents.md.
  buildEnd: (config) => {
    agentDocs(config, {
      product: 'smaltbi',
      version: packageVersion(path.resolve(here, '../../package.json')),
      versions: { 'report format': '1' },
      url: `https://stenhoor.github.io${base}`,
      intro: 'guide/agents.md',
      guide: ['reference/format/', 'reference/visuals/', 'THEMES', 'reference/shortcuts'],
    });
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon-32.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
    ['script', {}, `if (location.pathname.split('/').pop().split('.')[0] === 'REPORT_FORMAT') location.replace(${JSON.stringify(base)} + 'reference/format/' + (${JSON.stringify(FORMAT_MOVED)}[location.hash.slice(1)] ?? ''));`],
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
      { text: 'Demo', link: '/designer.html?report=examples/sales/report.json', target: '_self' },
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Guide', link: '/guide/' },
      {
        text: 'Reference',
        items: [
          { text: 'Report format', link: '/reference/format/' },
          { text: 'Visual types', link: '/reference/visuals/' },
          { text: 'Themes', link: '/THEMES' },
          { text: 'Plugins', link: '/PLUGINS' },
          { text: 'Keyboard shortcuts', link: '/reference/shortcuts' },
        ],
      },
      smaltworksMenu(),
    ],
    sidebar: [
      { text: 'Quick start', items: [{ text: 'Quick start', link: '/guide/quick-start' }] },
      {
        text: 'Getting started',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Tutorial', link: '/guide/tutorial' },
          { text: 'FAQ', link: '/guide/faq' },
          { text: 'For AI agents', link: '/guide/agents' },
        ],
      },
      {
        text: 'User guide',
        items: [
          { text: 'Overview', link: '/guide/' },
          { text: 'Data', link: '/guide/data' },
          { text: 'The model', link: '/guide/model' },
          { text: 'Visuals', link: '/guide/visuals' },
          { text: 'Pages and interaction', link: '/guide/pages' },
          { text: 'Publishing', link: '/guide/publishing' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Report format', link: '/reference/format/', collapsed: true, items: FORMAT },
          { text: 'Visual types', link: '/reference/visuals/', items: visualGroups() },
          { text: 'Themes', link: '/THEMES' },
          { text: 'Plugins', link: '/PLUGINS' },
          { text: 'Keyboard shortcuts', link: '/reference/shortcuts' },
        ],
      },
      {
        text: 'Project',
        collapsed: true,
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
    footer: smaltworksFooter(base),
  },
});
