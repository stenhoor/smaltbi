---
description: "Load data into a report: CSV, JSON and Parquet from URLs or your computer, SQL steps, and refresh."
---

# Data

A report's data is a list of steps. They run in order each time the report opens and build its smaltdb database, in
the reader's browser. Open **Data** in the top bar to edit them.

## Add files

- **From a URL:** under *Add a file from a URL*, enter its address, relative to the report or absolute. The table
  name fills in from the file name.
- **From your computer:** *Choose a file…* keeps the file in this browser, as `local:<name>`. Publishing copies it
  into the site.
- **Formats:** CSV, TSV, JSON, NDJSON and Parquet.
- **Import or link:** an import copies the file into a table; a link reads it in place, as an external table.

## SQL steps

A step can be SQL that runs after the files load: `CREATE VIEW big_orders AS SELECT * FROM orders WHERE amount > 100`,
or a `.sql` file. smaltdb's SQL is [smaltql](https://stenhoor.github.io/smaltql/), SQLite's dialect.

## Refresh

A reader clicks *Refresh* in the viewer bar, beside the time the data was loaded, to run the steps again. To refresh
on a timer as well, set *Refresh* in the Data dialog to a number of minutes.

## In `report.json`

The steps are `data.steps`: [Report format, data](/REPORT_FORMAT#data).

```jsonc
"data": {
  "refresh": { "every": 15 },
  "steps": [
    { "import": "data/sales.csv", "table": "sales" },
    { "link": "data/rates.csv", "table": "rates", "format": "csv" },
    { "sql": "CREATE VIEW big_orders AS SELECT * FROM orders WHERE amount > 100" }
  ]
}
```
