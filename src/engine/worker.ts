// smaltbi's engine worker (bundled into vendor/smaltdb/smaltdb-worker.js by scripts/vendor-smaltdb.mjs):
// the smaltdb engine with SQL (smaltql) and the plugins the data steps use: CSV / JSON import and export
// (@smaltdb/io), external tables and local files (@smaltdb/external), and Parquet (@smaltdb/parquet).
import { defineWorker } from 'smaltdb/worker-runtime';
import { sqlLanguage } from 'smaltql';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';

defineWorker({ languages: [sqlLanguage], plugins: [io, external, parquet] });
