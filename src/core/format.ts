// Value formatting lives in smaltkit (smaltkit/format); the model's Format and ColumnType are the same types.
export { axisFormatter, dateParts, formatDate, formatSpec, formatter, type Formatter } from 'smaltkit/format';

/** The display formats the designer offers a measure or calculated column, with their labels (and the agent, by value). */
export const FORMAT_PRESETS: readonly (readonly [string, string])[] = [
  ['number', 'Number'],
  ['integer', 'Whole number'],
  ['decimal', 'Decimal (2)'],
  ['percent', 'Percent'],
  ['currency', 'Currency'],
  ['currency0', 'Currency, no cents'],
  ['compact', 'Compact (1.2K)'],
  ['currency-compact', 'Currency compact'],
  ['date', 'Date'],
  ['month', 'Month'],
  ['year', 'Year'],
];
