// The visual plugin API. Every built-in visual is written against this API, so a third-party
// visual is a peer of the built-ins: register a VisualDef and it appears in the designer.
import type { Aggregation, Filter, SqlValue, Visual } from '../core/types.js';
import type { ResolvedField } from '../core/model.js';
import type { QuerySpec } from '../core/compile.js';
import type { Formatter } from '../core/format.js';

export interface RoleDef {
  name: string;
  label: string;
  /** dimension: grouped by; measure: aggregated; a column dropped on a measure role gets SUM/COUNT. */
  kind: 'dimension' | 'measure';
  /** Maximum number of fields (default unlimited). */
  max?: number;
  /** Fields in this role form a drill path (Year → Quarter → Month) instead of all being used at once. */
  drill?: boolean;
}

export interface OptionDef {
  key: string;
  label: string;
  type: 'bool' | 'select' | 'number' | 'text' | 'textarea' | 'color';
  choices?: [string, string][];
  default?: unknown;
  /** Show only when another option has a value. */
  when?: { key: string; equals: unknown };
}

/** One column of a query result, with its role and formatter. */
export interface DataColumn {
  key: string;
  role: string;
  label: string;
  field: ResolvedField;
  values: ArrayLike<SqlValue>;
  fmt: Formatter;
}

export interface VisualData {
  rows: number;
  columns: DataColumn[];
  /** Columns of a role, in field order. */
  role(name: string): DataColumn[];
  dims: DataColumn[];
  measures: DataColumn[];
}

export interface Plan {
  main: QuerySpec;
  /** Additional queries (totals, sparklines, …), keyed by name. */
  extra?: Record<string, QuerySpec>;
}

export interface PlanContext {
  visual: Visual;
  /** Fields of each role, resolved (drill already applied). */
  fields: Record<string, ResolvedField[]>;
  /** The default plan: every dimension role, then every measure role, in definition order. */
  defaultPlan(): Plan;
  /** Fields of the given roles, flattened. */
  pick(...roles: string[]): ResolvedField[];
  /** An aggregate of a field (e.g. MIN / MAX of a column for a range slicer). */
  aggregate(field: ResolvedField, agg: Aggregation): ResolvedField;
}

export interface RenderContext {
  el: HTMLElement;
  width: number;
  height: number;
  visual: Visual;
  options: Record<string, unknown>;
  data: VisualData;
  extra: Record<string, VisualData>;
  /** Number of colors in the theme palette (series classes cycle sb-c0 … sb-c{n-1}). */
  palette: number;
  locale?: string;
  /** null when nothing is selected in this visual, else whether row `i` is selected. */
  selected(row: number): boolean | null;
  /** Interactions. */
  api: VisualApi;
}

export interface VisualApi {
  /** Select the data point of row `i` (cross-filters the page). additive = ctrl/cmd held. */
  select(row: number, additive?: boolean): void;
  /** Replace this visual's filters on the page (slicers). Empty array clears. */
  setFilters(filters: Filter[]): void;
  /** This visual's current filters (slicer state). */
  filters(): Filter[];
  /** Fetch distinct values etc. for controls that need more data. */
  query(spec: QuerySpec): Promise<VisualData>;
  /** Drill down on row `i`. */
  drill(row: number): void;
}

export interface VisualDef {
  type: string;
  label: string;
  /** SVG markup (24×24 viewBox) for the gallery. */
  icon: string;
  group: 'core' | 'advanced' | 'plugin';
  roles: RoleDef[];
  options?: OptionDef[];
  /** Default sort: by the first measure descending (`value`), or by the first dimension (`category`). */
  sort?: 'value' | 'category';
  limit?: number;
  /** Visual handles clicks itself (slicers) instead of the generic row selection. */
  selfInteractive?: boolean;
  /** Slicers do not get filtered by their own selection and filter other visuals. */
  slicer?: boolean;
  /** Static visuals (text, image) do not query data when they have no fields. */
  static?: boolean;
  plan?(ctx: PlanContext): Plan;
  render(ctx: RenderContext): void;
}

const registry = new Map<string, VisualDef>();

export function registerVisual(def: VisualDef): void {
  registry.set(def.type, def);
}

export function visualDef(type: string): VisualDef | undefined {
  return registry.get(type);
}

export function visualDefs(): VisualDef[] {
  return [...registry.values()];
}

/** Merge option defaults with a visual's options. */
export function optionsOf(def: VisualDef, v: Visual): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const d of def.options ?? []) if (d.default !== undefined) o[d.key] = d.default;
  return { ...o, ...(v.options ?? {}) };
}

/** Shared chart option definitions. */
export const LEGEND_OPTION: OptionDef = {
  key: 'legend',
  label: 'Legend',
  type: 'select',
  choices: [
    ['auto', 'Auto'],
    ['top', 'Top'],
    ['bottom', 'Bottom'],
    ['right', 'Right'],
    ['none', 'Hidden'],
  ],
  default: 'auto',
};

export const LABELS_OPTION: OptionDef = { key: 'labels', label: 'Data labels', type: 'bool', default: false };

/** Build a legend (HTML) for series names. */
export function legendHtml(names: string[], palette: number, esc: (s: unknown) => string, offset = 0): string {
  return (
    '<div class="sb-legend">' +
    names.map((n, i) => `<span class="sb-legend-item sb-c${(i + offset) % palette}"><i></i>${esc(n)}</span>`).join('') +
    '</div>'
  );
}
