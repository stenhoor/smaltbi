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
    // The app follows the site's light / dark switch through its own setting (smaltbi.mode), which the viewer reads
    // when it opens and listens to (storage event).
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
