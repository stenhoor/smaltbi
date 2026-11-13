// Plugin loading (ADR 0008). A report lists plugins by URL and integrity hash; each is one ES module file that exports
// `setup(api)` (or a default object with it). The loader fetches the file, checks its hash, imports it from a blob URL
// and calls setup with the plugin API. A plugin that fails to load or set up is reported, never fatal: the report
// renders, and its visuals say which plugin is missing.
import * as kit from 'smaltkit';
import type { PluginRef } from '../core/types.js';
import { LABELS_OPTION, LEGEND_OPTION, chartContext, registerVisual, visualDef, type VisualDef } from '../visuals/api.js';

/** The plugin API version this build offers. A plugin may say which it needs (`apiVersion`). */
export const PLUGIN_API_VERSION = 1;

/** What a plugin's setup gets. */
export interface PluginApi {
  apiVersion: number;
  /** Register a visual. Its type must be namespaced (`acme.bullet`) and new; it shows in the gallery's Plugins group. */
  registerVisual(def: VisualDef): void;
  /** smaltkit: charts, tables, formatting, SVG and DOM helpers, so a plugin visual can reuse them. */
  kit: typeof kit;
  /** The smaltkit chart context for a render context (to call kit.columnChart(chartContext(ctx)) and the like). */
  chartContext: typeof chartContext;
  options: { legend: typeof LEGEND_OPTION; labels: typeof LABELS_OPTION };
}

export interface PluginModule {
  name?: string;
  apiVersion?: number;
  setup(api: PluginApi): void | Promise<void>;
}

export interface LoadedPlugin {
  ref: PluginRef;
  url: string;
  name: string;
  visuals: string[];
}

export interface FailedPlugin {
  ref: PluginRef;
  url: string;
  error: string;
}

/** Plugins already loaded in this page, by URL and hash: a plugin runs once, whichever report asks for it. */
const loaded = new Map<string, LoadedPlugin>();

const keyOf = (url: string, integrity: string) => `${url} ${integrity}`;

/** The SRI string (`sha384-<base64>`) of some bytes. */
export async function integrityOf(bytes: ArrayBuffer, algo: 'sha256' | 'sha384' | 'sha512' = 'sha384'): Promise<string> {
  const digest = await crypto.subtle.digest(algo.replace('sha', 'SHA-'), bytes);
  let bin = '';
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return `${algo}-${btoa(bin)}`;
}

/** Whether bytes match an integrity value (one or more `sha256-…`, `sha384-…`, `sha512-…`, space-separated). */
export async function checkIntegrity(bytes: ArrayBuffer, integrity: string): Promise<boolean> {
  const wanted = integrity.trim().split(/\s+/).filter(Boolean);
  if (!wanted.length) return false;
  for (const w of wanted) {
    const algo = w.slice(0, w.indexOf('-'));
    if (algo !== 'sha256' && algo !== 'sha384' && algo !== 'sha512') continue;
    if ((await integrityOf(bytes, algo)) === w) return true;
  }
  return false;
}

/** Fetch a plugin file: its bytes (for the hash) as the loader will see them. */
export async function fetchPlugin(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.arrayBuffer();
}

/** The plugin API for one plugin: visuals it registers are recorded, namespaced and checked. */
function apiFor(record: LoadedPlugin): PluginApi {
  return {
    apiVersion: PLUGIN_API_VERSION,
    registerVisual(def: VisualDef) {
      if (!def || typeof def.type !== 'string' || !/^[a-z0-9-]+\.[a-z0-9.-]+$/i.test(def.type)) throw new Error(`a plugin visual's type must be namespaced, like "acme.bullet" (got "${def?.type}")`);
      if (visualDef(def.type)) throw new Error(`visual type "${def.type}" is already registered (by another plugin?)`);
      if (typeof def.render !== 'function') throw new Error(`visual "${def.type}" has no render function`);
      registerVisual({ ...def, group: 'plugin' });
      record.visuals.push(def.type);
    },
    kit,
    chartContext,
    options: { legend: LEGEND_OPTION, labels: LABELS_OPTION },
  };
}

/** Load one plugin (once per page). Throws with a message a person can act on. */
export async function loadPlugin(ref: PluginRef, base: string): Promise<LoadedPlugin> {
  const url = new URL(ref.url, base).href;
  if (!ref.integrity) throw new Error('it has no integrity hash (add it again in the designer to record one)');
  const key = keyOf(url, ref.integrity);
  const had = loaded.get(key);
  if (had) return had;
  if (!/^https?:/.test(url)) throw new Error('plugins load over http(s) only');
  const bytes = await fetchPlugin(url).catch((e: Error) => {
    throw new Error(`cannot fetch it: ${e.message}`);
  });
  if (!(await checkIntegrity(bytes, ref.integrity))) throw new Error('its contents do not match the integrity hash (the file has changed)');
  const blob = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  let mod: Partial<PluginModule> & { default?: Partial<PluginModule> | ((api: PluginApi) => void) };
  try {
    mod = (await import(/* @vite-ignore */ blob)) as typeof mod;
  } catch (e) {
    throw new Error(`it is not a valid module: ${(e as Error).message}`);
  } finally {
    URL.revokeObjectURL(blob);
  }
  const def = typeof mod.default === 'function' ? { setup: mod.default } : (mod.default ?? mod);
  if (typeof def.setup !== 'function') throw new Error('it exports no setup(api) function');
  if (def.apiVersion && def.apiVersion > PLUGIN_API_VERSION) throw new Error(`it needs plugin API ${def.apiVersion}; this smaltbi offers ${PLUGIN_API_VERSION}`);
  const record: LoadedPlugin = { ref, url, name: ref.name ?? def.name ?? new URL(url).pathname.split('/').pop() ?? url, visuals: [] };
  await def.setup(apiFor(record));
  loaded.set(key, record);
  return record;
}

/** Load a report's plugins; failures are collected, not thrown. */
export async function loadPlugins(refs: PluginRef[] | undefined, base: string): Promise<{ loaded: LoadedPlugin[]; failed: FailedPlugin[] }> {
  const out = { loaded: [] as LoadedPlugin[], failed: [] as FailedPlugin[] };
  for (const ref of refs ?? []) {
    const url = (() => {
      try {
        return new URL(ref.url, base).href;
      } catch {
        return ref.url;
      }
    })();
    try {
      out.loaded.push(await loadPlugin(ref, base));
    } catch (e) {
      out.failed.push({ ref, url, error: (e as Error).message });
      console.warn(`smaltbi: plugin ${url} not loaded: ${(e as Error).message}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ trust

const TRUST_KEY = 'smaltbi.trustedPlugins';

function trustedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Remember that the person allowed these plugins (URL and hash), so they load without asking next time. */
export function trustPlugins(refs: PluginRef[], base: string): void {
  const s = trustedSet();
  for (const r of refs) s.add(keyOf(new URL(r.url, base).href, r.integrity));
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify([...s].slice(-200)));
  } catch {}
}

/**
 * The plugins that need the person's say-so before they run: none when the report comes from this page's own site
 * (its author published them together); otherwise those not allowed before.
 */
export function untrustedPlugins(refs: PluginRef[] | undefined, base: string, origin = location.origin): PluginRef[] {
  if (!refs?.length) return [];
  let reportOrigin = '';
  try {
    reportOrigin = new URL(base).origin;
  } catch {}
  if (reportOrigin === origin) return [];
  const s = trustedSet();
  return refs.filter((r) => !s.has(keyOf(new URL(r.url, base).href, r.integrity)));
}
