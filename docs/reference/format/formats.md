---
description: "Number and date formats: presets, format objects and patterns."
---

# Formats

A format is a preset name or an object:

| Preset | Example |
|---|---|
| `number` | 1,234.57 |
| `integer` | 1,235 |
| `decimal` | 1,234.57 |
| `percent` | 12.3% (value 0.123) |
| `currency`, `currency0` | $1,234.57, $1,235 |
| `compact`, `currency-compact` | 1.2K, $1.2K |
| `date`, `datetime`, `month`, `year` | 2025-03-09, 2025-03-09 14:05, Mar 2025, 2025 |

Objects: `{ "currency": "EUR", "decimals": 0, "compact": true, "percent": true, "prefix": "~", "suffix": " kg", "scale": 0.001, "locale": "de-DE", "date": "D MMM YYYY" }`.
Patterns such as `"$#,0.00"` or `"0.0%"` also work.
