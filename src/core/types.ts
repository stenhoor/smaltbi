// The smaltbi report document: a plain, human-readable JSON file that diffs well in git.
// See docs/REPORT_FORMAT.md for the full description of every field.

export type SqlValue = null | number | bigint | string | Uint8Array;

/** A report file (`*.smaltbi.json`). */
export interface Report {
  smaltbi: 1;
  name: string;
  description?: string;
  /** Where the data comes from (smaltui environment manifest compatible). */
  data: DataSpec;
  /** The semantic model: relationships, measures, calculated columns, hierarchies. */
  model: ModelSpec;
  /** A theme: inline tokens, or a URL / path of a `.theme.json` file. */
  theme?: Theme | string;
  /** Report-level filters (apply to every page). */
  filters?: Filter[];
  pages: Page[];
  bookmarks?: Bookmark[];
  /** Published-report branding. */
  branding?: {
    /** Show the "Powered by smaltbi" badge (from stenhoor/smalt-brand) in the viewer. Default true. */
    poweredBy?: boolean;
  };
}

// ------------------------------------------------------------------ data

export interface DataSpec {
  /** The smaltdb database the report runs on. Default: an in-memory database named after the report. */
  database?: { name: string; storage?: 'memory' | 'opfs' };
  /** OPFS only: rebuild on every load (`always`), only when missing (`once`), or never touch it (`none`). */
  init?: 'always' | 'once' | 'none';
  steps?: DataStep[];
}

export type DataStep =
  | { sql: string }
  | { sqlFile: string }
  | { import: string; table: string; format?: FileFormat; options?: Record<string, unknown> }
  | { link: string; table: string; format?: FileFormat; options?: Record<string, unknown>; connectionName?: string }
  | { table: string; data: Record<string, unknown>[] }
  | { connection: string; url: string };

export type FileFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet';

// ------------------------------------------------------------------ model

export interface ModelSpec {
  /** Many-to-one relationships: `from` is the foreign key (many side), `to` the key (one side). */
  relationships?: Relationship[];
  measures?: Measure[];
  columns?: CalcColumn[];
  hierarchies?: Hierarchy[];
  /** Per-table display settings. */
  tables?: Record<string, TableSettings>;
  /** Where each table card sits in the designer's model diagram (pixels). Display only. */
  layout?: Record<string, { x: number; y: number }>;
}

export interface Relationship {
  from: string; // "orders.customer_id"
  to: string; // "customers.id"
  active?: boolean;
}

export interface Measure {
  table: string;
  name: string;
  /** An aggregate SQL expression. `[Other Measure]` inlines another measure of the model. */
  sql: string;
  format?: Format;
  description?: string;
  folder?: string;
}

export interface CalcColumn {
  table: string;
  name: string;
  /** A row-level SQL expression over the table's columns (and related tables' columns). */
  sql: string;
  type?: ColumnType;
  format?: Format;
  /** Sort this column by another column of the same table (e.g. month name by month number). */
  sortBy?: string;
  description?: string;
}

export interface Hierarchy {
  table: string;
  name: string;
  /** Column names of `table`, from the top level down. */
  levels: string[];
}

export interface TableSettings {
  label?: string;
  hidden?: boolean;
  description?: string;
  columns?: Record<string, { label?: string; hidden?: boolean; format?: Format; sortBy?: string; type?: ColumnType }>;
}

export type ColumnType = 'number' | 'text' | 'date' | 'datetime' | 'bool' | 'any';

/**
 * A display format: a preset name, or `Intl.NumberFormat` / date options with a few extras.
 * Presets: number, integer, decimal, percent, currency, compact, date, datetime, month, year, text.
 */
export type Format = string | FormatSpec;

export interface FormatSpec {
  preset?: string;
  decimals?: number;
  currency?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  percent?: boolean;
  /** Multiply before formatting (e.g. 0.001 to show thousands). */
  scale?: number;
  locale?: string;
  /** Date pattern tokens: YYYY YY MMMM MMM MM M DD D HH mm ss Q. */
  date?: string;
}

// ------------------------------------------------------------------ pages and visuals

export interface Page {
  id: string;
  name: string;
  visuals: Visual[];
  filters?: Filter[];
  /** Fields that make this page a drill-through target. */
  drillthrough?: string[];
  hidden?: boolean;
  /** Page background etc. Falls back to the theme's page settings. */
  layout?: Partial<PageLayout>;
}

export interface PageLayout {
  /** Page width in px (the canvas scales to fit the window). */
  width: number;
  /** Rows of the grid shown in the designer; the page grows when visuals go further. */
  rows: number;
  columns: number;
  rowHeight: number;
  gap: number;
  fit: 'width' | 'page' | 'none';
}

export interface Visual {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  layout: { x: number; y: number; w: number; h: number };
  /** Data roles (category, values, series, …) to field references. */
  fields: Record<string, FieldRef[]>;
  options?: Record<string, unknown>;
  filters?: Filter[];
  sort?: SortSpec[];
  limit?: number;
  /** Custom SQL: replaces the generated query. Output columns map to roles by `fields` labels. */
  sql?: string;
  /** Interaction settings. */
  interactions?: { filterOthers?: boolean; filteredByOthers?: boolean };
  /** Per-visual style overrides of theme tokens (e.g. { "surface": "#fff" }). */
  style?: Record<string, string | number>;
}

/** "table.column", "table.Measure" or "table.Hierarchy", or an object with an aggregation or label. */
export type FieldRef = string | FieldRefSpec;

export interface FieldRefSpec {
  field: string;
  agg?: Aggregation;
  label?: string;
  format?: Format;
}

export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countd' | 'none';

export interface SortSpec {
  /** A role and index ("values:0") or a field reference. */
  by: string;
  dir?: 'asc' | 'desc';
}

export type FilterOp =
  | 'in'
  | 'not-in'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'contains'
  | 'starts-with'
  | 'is-null'
  | 'not-null'
  | 'top'
  | 'tuples'
  | 'sql';

export interface Filter {
  field?: string;
  /** For `tuples`: several fields matched together (cross-filter selections). */
  fields?: string[];
  op: FilterOp;
  values?: SqlValue[];
  tuples?: SqlValue[][];
  /** For `top`: rank by this measure. */
  by?: string;
  /** For `sql`: a raw boolean SQL expression. */
  sql?: string;
  /** Shown in the filter pane, but the user cannot change it. */
  locked?: boolean;
  label?: string;
}

export interface DrillState {
  /** Index of the level shown. */
  level: number;
  /** Values the upper levels are filtered to, by level index (absent: all values). */
  path: Record<string, SqlValue>;
}

export interface Bookmark {
  name: string;
  state: ViewState;
}

/** Everything about how a report is being looked at (not what it is). Serialized into the URL. */
export interface ViewState {
  page: string;
  /** Selections by visual id: cross-filters and slicer values. */
  selections?: Record<string, Filter[]>;
  /** Drill state by visual id. */
  drill?: Record<string, DrillState>;
  /** Filters set by a drill-through into the current page. */
  drillthrough?: { from: string; filters: Filter[] };
}

// ------------------------------------------------------------------ theme

export interface Theme {
  name: string;
  /** A theme to start from (built-in name or URL). */
  extends?: string;
  colors?: Partial<ThemeColors>;
  /** Categorical series colors. */
  palette?: string[];
  /** Sequential ramp (low → high) for heatmaps and gradients. */
  sequential?: string[];
  /** Diverging ramp (negative → neutral → positive). */
  diverging?: string[];
  fonts?: Partial<{ body: string; heading: string; numeric: string; imports: string[] }>;
  sizes?: Partial<{ base: number; title: number; subtitle: number; label: number; kpi: number; small: number }>;
  visual?: Partial<{
    radius: number;
    padding: number;
    border: string;
    shadow: string;
    titleAlign: 'left' | 'center' | 'right';
    titleWeight: number;
    gridlines: boolean;
    barRadius: number;
    lineWidth: number;
    markerSize: number;
  }>;
  page?: Partial<PageLayout> & { background?: string; padding?: number };
  /** Overrides for dark mode (`prefers-color-scheme: dark` or the viewer's toggle). */
  dark?: Partial<Pick<Theme, 'colors' | 'palette' | 'sequential' | 'diverging'>>;
  /** Raw CSS appended after the generated variables, for anything tokens do not cover. */
  css?: string;
}

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  grid: string;
  accent: string;
  positive: string;
  negative: string;
  neutral: string;
  selection: string;
  /** Text drawn on top of series colours (data labels on slices, tiles, heat cells). Default white. */
  onMark: string;
}
