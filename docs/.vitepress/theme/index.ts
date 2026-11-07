import DefaultTheme from 'vitepress/theme';
import { withBase, type Theme } from 'vitepress';
import { h } from 'vue';
import './smaltdb.css';
import './smaltbi.css';

// The work-in-progress badge, at the top of every page (smalt-brand BRAND.md, "Before 1.0"): under the hero's title on
// the home page, above the content on the others. Linked to the stability page.
const stage = () =>
  h('div', { class: 'sb-stage' }, [
    h('a', { href: 'https://smaltworks.dev/stability' }, [
      h('img', { class: 'sw-light', src: withBase('/work-in-progress.svg'), alt: 'Work in progress. Come build with us.', height: 56 }),
      h('img', { class: 'sw-dark', src: withBase('/work-in-progress-on-dark.svg'), alt: 'Work in progress. Come build with us.', height: 56 }),
    ]),
  ]);

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-info-after': stage, 'doc-before': stage }),
  enhanceApp() {
    if (typeof window === 'undefined') return;
    // The embedded report (an iframe of the viewer) follows the site's light / dark switch through the viewer's
    // own setting (smaltbi.mode); the viewer listens for its storage event.
    const sync = () => {
      const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      try {
        if (localStorage.getItem('smaltbi.mode') !== mode) localStorage.setItem('smaltbi.mode', mode);
      } catch {}
    };
    sync();
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  },
} satisfies Theme;
