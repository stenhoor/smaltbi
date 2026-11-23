# Formats

How a value shows: a preset name, a pattern, or an object. Measures, columns, parameters and a visual's fields take a
`format`.

## Presets

| Preset | Example |
|---|---|
| `number` | 1,234.57 |
| `integer` | 1,235 |
| `decimal` | 1,234.57 |
| `percent` | 12.3% (value 0.123) |
| `currency`, `currency0` | $1,234.57, $1,235 |
| `compact`, `currency-compact` | 1.2K, $1.2K |
| `date`, `datetime`, `month`, `year` | 2025-03-09, 2025-03-09 14:05, Mar 2025, 2025 |
| `text` | No format of its own: the field's type decides |

Patterns such as `"$#,0.00"` or `"0.0%"` also work. The currency presets are in US dollars: give an object with
`currency` for another. A blank value (SQL `NULL`) shows as *(Blank)*.

## Objects

```json
{ "currency": "EUR", "decimals": 0, "compact": true }
```

| Field | Type | Meaning |
|---|---|---|
| `preset` | string | A preset to start from. |
| `decimals` | number | Digits after the point. |
| `currency` | string | An ISO currency code: `"EUR"`. |
| `prefix`, `suffix` | string | Text before or after: `"~"`, `" kg"`. |
| `compact` | boolean | 1.2K, 3.4M. |
| `percent` | boolean | Multiply by 100 and add `%`. |
| `scale` | number | Multiply before formatting: `0.001` shows thousands. |
| `locale` | string | `"de-DE"`. |
| `date` | string | A date pattern, from the tokens `YYYY YY MMMM MMM MM M DD D HH mm ss Q`: `"D MMM YYYY"`. |

## See also

[Model](./model) · [Visual](./visual)
