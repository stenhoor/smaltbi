import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import './smaltdb.css';
import './smaltbi.css';
import { withSmaltworks } from './stage';

export default {
  extends: DefaultTheme,
  Layout: withSmaltworks(DefaultTheme),
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
