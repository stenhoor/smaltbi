---
description: "The data steps: the files, URLs and SQL that build a report's database, in order."
---

# Data

```jsonc
"data": {
  "database": { "name": "sales", "storage": "memory" },   // or "opfs"
  "init": "always",            // opfs: "once" (default: build only if empty) | "always" | "none" (use as is)
  "refresh": { "every": 15 },  // optional: the viewer loads the data again every 15 minutes (while visible)
  "steps": [
    { "import": "data/sales.csv", "table": "sales" },                       // copy into a table
    { "import": "https://…/x.parquet", "table": "x" },
    { "import": "local:orders.csv", "table": "orders" },                    // a file kept in this browser
    { "link": "data/rates.csv", "table": "rates", "format": "csv" },         // external table, read in place
    { "sql": "CREATE VIEW big_orders AS SELECT * FROM orders WHERE amount > 100" },
    { "sqlFile": "views.sql" },
    { "table": "targets", "data": [ { "region": "EU", "target": 100 } ] },  // inline rows
    { "connection": "api", "url": "https://data.example.com/" }             // smaltdb connection
  ]
}
```

`format` is inferred from the extension (`csv`, `tsv`, `json`, `ndjson`, `parquet`); `options` pass
through to smaltdb's importers / external tables. This is the same step format as smaltui's
environment manifests. To report on an existing OPFS database, use
`{ "database": { "name": "mydb", "storage": "opfs" }, "init": "none" }` with no steps.

In the designer: [Data](/guide/data).
