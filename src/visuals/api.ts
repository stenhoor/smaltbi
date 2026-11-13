// The visual plugin API. Every built-in visual is written against this API, so a third-party
// visual is a peer of the built-ins: register a VisualDef and it appears in the designer.
import type { Parameter, Aggregation, Filter, SqlValue, Visual } from '../core/types.js';
import type { ResolvedField } from '../core/model.js';
import type { QuerySpec } from '../core/compile.js';
import type { CellFormat, ChartColumn, ChartContext } from 'smaltkit/charts';

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
  /** A heading in the Format tab: options after it, up to the next section, go under it. */
  section?: string;
}

/**
 * One column of a query result, with its role and formatter. It is a smaltkit ChartColumn (kind, type,
 * format and ref come from the field) plus the resolved model field.
 */
export interface DataColumn extends ChartColumn {
  field: ResolvedField;
  values: ArrayLike<SqlValue>;
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
  /** Number of colors in the theme palette (series classes cycle sk-c0 … sk-c{n-1}). */
  palette: number;
  locale?: string;
  /** The report's URL: files a visual names (a map's shapes) resolve against it, like data files. */
  base?: string;
  /** null when nothing is selected in this visual, else whether row `i` is selected. */
  selected(row: number): boolean | null;
  /** Conditional formatting of a measure value (report/conditional.ts); tables, matrices and cards use it. */
  cellFormat?(column: DataColumn, row: number): CellFormat | null;
  /** The reader changed an option on the visual (a table's column widths): the designer keeps it. */
  setOption?(key: string, value: unknown): void;
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
  /** What-if parameters of the model (for a Parameter control). */
  parameters(): Parameter[];
  /** A parameter's current value. */
  param(name: string): number | string | undefined;
  /** Change a parameter: every visual runs again. */
  setParam(name: string, value: number | string): void;
}

export interface VisualDef {
  type: string;
  label: string;
  /** SVG markup (24×24 viewBox) for the gallery. */
  icon: string;
  group: 'core' | 'advanced' | 'plugin';
  roles: RoleDef[];
  options?: OptionDef[];
  /** The Format tab offers reference lines (options.refLines, drawn by smaltkit's cartesian charts). */
  refLines?: boolean;
  /** Default sort: by the first measure descending (`value`), or by the first dimension (`category`). */
  sort?: 'value' | 'category';
  limit?: number;
  /** Visual handles clicks itself (slicers) instead of the generic row selection. */
  selfInteractive?: boolean;
  /** Slicers do not get filtered by their own selection and filter other visuals. */
  slicer?: boolean;
  /** Static visuals (text, image) do not query data when they have no fields. */
  static?: boolean;
  /** Draws conditional formatting (Visual.conditional): tables, matrices and KPI cards. */
  conditional?: boolean;
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

export { legendHtml } from 'smaltkit/charts';

/** The smaltkit chart context for a visual: the render context plus the visual's row limit. */
export function chartContext(ctx: RenderContext): ChartContext {
  return { ...ctx, limit: ctx.visual.limit };
}

/** A result column for a resolved field. */
export function dataColumn(key: string, role: string, label: string, field: ResolvedField, values: ArrayLike<SqlValue>, fmt: DataColumn['fmt']): DataColumn {
  return { key, role, label, field, values, fmt, kind: field.kind === 'measure' ? 'measure' : 'dimension', type: field.type, format: field.format, ref: field.ref };
}
