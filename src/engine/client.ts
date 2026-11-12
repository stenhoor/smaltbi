// smaltbi's engine client (bundled into vendor/smaltdb/smaltdb.js by scripts/vendor-smaltdb.mjs and loaded at run
// time by smaltkit/engine, see src/report/engine.ts): smaltql's open(), a smaltdb database whose worker reads SQL, and
// the client helpers of the plugins built into smaltbi's worker (src/engine/worker.ts). From smaltdb 0.9 the helpers
// are functions that take the database (smaltdb ADR 0012); smaltui's vendor client has the same shape.
export { open } from '@smaltworks/smaltql';
export { importCSV, importJSON, exportCSV, exportJSON } from '@smaltdb/io/client';
export { registerFile, registerCredentials } from '@smaltdb/external/client';
