# Data

A report builds its database when it opens, from **data steps**: import or link files, run SQL, add rows. The database
is [smaltdb](https://smaltdb.dev), in the reader's browser: in memory, or in the browser's private storage (OPFS).

## Add data

Open **Data** in the top bar and add steps:

- **Add a file from a URL:** a CSV, TSV, JSON, NDJSON or Parquet file. Its rows are copied into a table, or, with
  **Link (query in place, no copy)**, it becomes an external table that queries read where it is.
- **Add a file from this computer:** kept in this browser (a `local:` step) and included when you publish.
- **Add SQL:** views, cleanup, derived tables.

**Storage** chooses where the database lives: in memory (rebuilt on open), or the browser's storage, OPFS (kept
between visits). Steps run in order to build the report's database.

## Refresh

The viewer bar shows when the data was loaded, and *Refresh* runs the steps again. To refresh on a timer as well, set
*Refresh* in the Data dialog to a number of minutes: the viewer reloads the data while the page is visible.

## An existing database

**Or report on an existing smaltdb database** lists the databases in this browser's storage (OPFS). The report then
uses the one you choose as it is, without steps.

## What's next

- [Model](./model): relate the tables and add measures.
- [Data in the report format](../reference/data): every step kind and option.
