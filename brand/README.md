# Brand assets

Copies of smaltbi's assets from [stenhoor/smalt-brand](https://github.com/stenhoor/smalt-brand), the source
of the smalt family's logos, badges, colours, type and voice (see its `BRAND.md`). Don't edit these files:
change smalt-brand, then re-sync:

```bash
git clone --depth 1 https://github.com/stenhoor/smalt-brand ../smalt-brand
node scripts/sync-brand.mjs ../smalt-brand
```

`SOURCE.json` records the smalt-brand commit they came from.

| File | Used for |
|---|---|
| `lockup.svg`, `lockup-on-dark.svg` | README header |
| `scatter-mark.svg`, `scatter-mark-on-dark.svg` | Designer and viewer logo |
| `favicon-32.svg`, `favicon-16.svg`, `app-icon.svg` | Browser tab and app icons |
| `powered-by-smaltbi*.svg` | The badge in published reports |
| `powered-by-smaltdb*.svg` | smaltbi's own README (it is built on smaltdb) |
| `tokens.json` | The Kiln palette; `themes/smalt.theme.json` and `styles/app.css` use these values |
| `wordmark*.svg` | Kept for docs and slides |

The wordmark, lockup and badge SVGs contain Geist and Martian Mono glyphs converted to paths
(SIL Open Font License 1.1).
