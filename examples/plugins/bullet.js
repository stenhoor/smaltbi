// An example smaltbi plugin (docs/PLUGINS.md): a bullet chart. One ES module file with no imports: smaltbi passes
// everything it needs to setup(api). Add it in the designer with File → Plugins…, by this file's URL.
export default {
  name: 'Bullet chart (example)',
  apiVersion: 1,
  setup(api) {
    const { esc, linear, band, r2 } = api.kit;
    api.registerVisual({
      type: 'example.bullet',
      label: 'Bullet chart',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h12M4 12h16M4 17h9"/><path d="M18 5v4M15 15v4"/></svg>',
      roles: [
        { name: 'category', label: 'Category', kind: 'dimension', max: 1 },
        { name: 'values', label: 'Value', kind: 'measure', max: 1 },
        { name: 'target', label: 'Target', kind: 'measure', max: 1 },
      ],
      options: [api.options.labels],
      sort: 'value',
      limit: 30,
      render(ctx) {
        const cat = ctx.data.role('category')[0];
        const val = ctx.data.role('values')[0];
        const tgt = ctx.data.role('target')[0];
        if (!val) {
          ctx.el.innerHTML = '<div class="sk-empty">Add a value (and a target)</div>';
          return;
        }
        const n = ctx.data.rows;
        const num = (v) => (typeof v === 'bigint' ? Number(v) : Number(v));
        let hi = 0;
        for (let r = 0; r < n; r++) hi = Math.max(hi, num(val.values[r]) || 0, tgt ? num(tgt.values[r]) || 0 : 0);
        const W = ctx.width;
        const H = ctx.height;
        const left = cat ? Math.min(W * 0.35, 120) : 8;
        const x = linear(0, hi || 1, left, W - 12);
        const y = band(Math.max(1, n), 4, H - 4, 0.35);
        let svg = '';
        for (let r = 0; r < n; r++) {
          const v = num(val.values[r]) || 0;
          const yy = y(r);
          const bh = y.bandwidth;
          if (cat) svg += `<text class="sk-tick" x="${r2(left - 6)}" y="${r2(yy + bh / 2 + 4)}" text-anchor="end">${esc(cat.fmt(cat.values[r]))}</text>`;
          svg += `<rect class="sk-mark sk-bar sk-c0" data-row="${r}" x="${r2(x(0))}" y="${r2(yy)}" width="${r2(Math.max(1, x(v) - x(0)))}" height="${r2(bh)}"/>`;
          if (tgt) {
            const t = num(tgt.values[r]);
            if (Number.isFinite(t)) svg += `<line class="ex-bullet-target" x1="${r2(x(t))}" x2="${r2(x(t))}" y1="${r2(yy - 3)}" y2="${r2(yy + bh + 3)}" stroke="var(--sk-text)" stroke-width="2"/>`;
          }
          if (ctx.options.labels) svg += `<text class="sk-label" x="${r2(x(v) + 4)}" y="${r2(yy + bh / 2 + 4)}">${esc(val.fmt(val.values[r]))}</text>`;
        }
        ctx.el.innerHTML = `<div class="sk-chart"><svg class="sk-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg></div>`;
      },
    });
  },
};
