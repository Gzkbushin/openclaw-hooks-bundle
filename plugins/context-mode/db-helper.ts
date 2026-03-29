// ---------------------------------------------------------------------------
// Lazy better-sqlite3 loader — isolated from index.ts so that index.ts stays
// free of createRequire (which breaks Node 22 --experimental-strip-types).
// The require() call is deferred until the first invocation of
// loadBetterSqlite3(), keeping it lazy for test environments that don't have
// the native module available.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

export function loadBetterSqlite3(): unknown {
  return _require("better-sqlite3");
}
