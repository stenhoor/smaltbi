# Data

`data`: the report's database and the steps that build it each time the report opens.

```jsonc
"data": {
  "database": { "name": "sales", "storage": "memory" },
  "init": "always",
  "refresh": { "every": 15 },
  "steps": [ … ]
}
```

## Fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `database.name` | string | the report's | The smaltdb database the report runs on. |
| `database.storage` | `"memory"` or `"opfs"` | `"memory"` | In memory (rebuilt on open), or the browser's private storage, OPFS (kept between visits). |
| `init` | `"always"`, `"once"` or `"none"` | `"once"` | OPFS only: rebuild on every load, build only when the database is empty, or never touch it (use it as it is). |
| `refresh.every` | number | | The viewer loads the data again every this many minutes, while the page is visible. |
| `steps` | array | | Data steps, run in order. |

To report on an existing OPFS database: `{ "database": { "name": "mydb", "storage": "opfs" }, "init": "none" }`, with
no steps.

## Steps

The step format is the smalt apps' environment manifest (`smaltkit/manifest`), shared with smaltui. The key that says
what a step does is `import`, `link`, `sql`, `sqlFile`, `data` or `connection`.

### import

Copies a file's rows into a table.

```jsonc
{ "import": "data/sales.csv", "table": "sales" }
{ "import": "https://example.com/x.parquet", "table": "x" }
{ "import": "local:orders.csv", "table": "orders" }      // a file kept in this browser
```

| Field | Meaning |
|---|---|
| `import` | The file: a path relative to the report, a URL, or `local:<name>` for a file kept in this browser. |
| `table` | The table to create. |
| `format` | `csv`, `tsv`, `json`, `ndjson` or `parquet`. Inferred from the extension when left out. |
| `options` | Reader options, passed to smaltdb's reader for the format: `header`, `delimiter`, `quote`, `null`, `skip`, `encoding`, … |

### link

An external table: the file stays where it is, and queries read it in place.

```jsonc
{ "link": "data/rates.csv", "table": "rates", "format": "csv" }
```

| Field | Meaning |
|---|---|
| `link` | The file, as for `import`. |
| `table` | The external table to create. |
| `format`, `options` | As for `import`. |
| `connectionName` | The connection the file is under: one a `connection` step made. |
| `columns` | The external table's columns, declared: each `{ "name": …, "type": … }` (`type` optional). |

### sql and sqlFile

Runs SQL: views, cleanup, derived tables.

```jsonc
{ "sql": "CREATE VIEW big_orders AS SELECT * FROM orders WHERE amount > 100" }
{ "sqlFile": "views.sql" }
```

### data

A table of inline rows.

```jsonc
{ "table": "targets", "data": [ { "region": "EU", "target": 100 } ] }
```

### connection

A smaltdb connection, for later steps to read from.

```jsonc
{ "connection": "api", "url": "https://data.example.com/" }
```

## Notes

- Steps run in order each time the report opens, and again when a reader clicks *Refresh*.
- Publishing copies every file the steps read into the site, `local:` files included (from the designer only).
- *Add date table* adds a SQL step, the last one, that builds the calendar. See [Model](./model#datetable).

## See also

[Data in the guide](../guide/data) · [Report](./report) · [Model](./model)
