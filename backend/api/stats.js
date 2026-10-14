// HALLPASS stats API — landing-page live stats from the chain indexer.
//
// MOUNT (server.js — do NOT edit server.js; the backend owner adds this one line):
//   app.use('/api', require('./api/stats'));
// That exposes GET /api/stats. The router also accepts an options object:
//   app.use('/api', require('./api/stats')({ dbPath: '/abs/path/to/db.sqlite' }));
//
// DEPENDENCY (backend owner adds to package.json): better-sqlite3 ^11
//
// HARD RULES: no mock data, no invented numbers. Every count is a real SQL
// aggregate over the indexer DB. Empty/missing DB -> zeros with
// source = "indexer-unavailable" (never a fake number).

const path = require('path');

let express;
try {
  express = require('express');
} catch (e) {
  express = null;
}

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
}

/** Resolve the indexer DB path. Env override first, then conventional locations. */
function resolveDbPath(explicit) {
  if (explicit) return explicit;
  if (process.env.INDEXER_DB) return process.env.INDEXER_DB;
  const here = __dirname; // <repo>/backend/api/
  return (
    tryPath(path.join(here, '..', 'indexer', 'db.sqlite')) ||
    tryPath(path.join(here, '..', 'db.sqlite')) ||
    tryPath(path.join(process.cwd(), 'db.sqlite')) ||
    path.join(here, '..', 'indexer', 'db.sqlite') // default (may not exist -> zeros)
  );
}

function tryPath(p) {
  try {
    require('fs').accessSync(p, require('fs').constants.R_OK);
    return p;
  } catch {
    return null;
  }
}

const EXPECTED_TABLES = ['installs', 'policies', 'spends', 'denials', 'revokes'];

/** table exists? — cheap, no throw. */
function hasTable(db, name) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

/** Safe COUNT(*) / scalar query. Returns null when the table is absent. */
function safeCount(db, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    const v = row ? Object.values(row)[0] : 0;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  } catch {
    return null; // table absent -> caller treats as missing, not as zero
  }
}

function tableAvailable(db, name) {
  try {
    return hasTable(db, name);
  } catch {
    return false;
  }
}

/**
 * Compute the live stats. Never throws; on any failure every metric is 0 and
 * `source` names the honest state (see STATS.md § "source values").
 */
function computeStats(dbPath) {
  const zero = {
    pluginsInstalled: 0,
    policiesActive: 0,
    spendsAllowed: 0,
    spendsBlocked: 0,
    revokes: 0,
    asOfBlock: null,
    source: 'indexer-unavailable',
  };

  if (!Database) return zero; // better-sqlite3 not installed
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return zero; // DB file missing or unreadable
  }

  try {
    const missing = EXPECTED_TABLES.filter((t) => !tableAvailable(db, t));
    const degraded = missing.length > 0;

    const nowSec = Math.floor(Date.now() / 1000);

    const pluginsInstalled = safeCount(
      db,
      'SELECT COUNT(DISTINCT account) AS c FROM installs WHERE uninstalled = 0'
    );
    const policiesActive = safeCount(
      db,
      'SELECT COUNT(*) AS c FROM policies WHERE revoked = 0 AND expiry > ?',
      [nowSec]
    );
    const spendsAllowed = safeCount(db, 'SELECT COUNT(*) AS c FROM spends');
    const spendsBlocked = safeCount(db, 'SELECT COUNT(*) AS c FROM denials');
    const revokes = safeCount(db, 'SELECT COUNT(*) AS c FROM revokes');

    let asOfBlock = null;
    try {
      const wm = db.prepare("SELECT value FROM meta WHERE key = 'last_block'").get();
      if (wm && /^\d+$/.test(String(wm.value))) {
        asOfBlock = Number(wm.value);
      } else {
        // Fallback: highest block seen across event tables.
        const fb = db
          .prepare(
            `SELECT MAX(b) AS m FROM (
               SELECT block_number AS b FROM spends
               UNION ALL SELECT block_number FROM denials
               UNION ALL SELECT block_number FROM revokes
               UNION ALL SELECT block_number FROM installs
             )`
          )
          .get();
        if (fb && Number.isFinite(fb.m)) asOfBlock = fb.m;
      }
    } catch {
      asOfBlock = null;
    }

    const anyMissing = [pluginsInstalled, policiesActive, spendsAllowed, spendsBlocked, revokes].some(
      (v) => v === null
    );

    return {
      pluginsInstalled: pluginsInstalled ?? 0,
      policiesActive: policiesActive ?? 0,
      spendsAllowed: spendsAllowed ?? 0,
      spendsBlocked: spendsBlocked ?? 0,
      revokes: revokes ?? 0,
      asOfBlock,
      source: degraded || anyMissing ? 'hallpass-indexer-degraded' : 'hallpass-indexer',
    };
  } catch {
    return zero;
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

function createStatsRouter(opts = {}) {
  if (!express) throw new Error("express is required to mount the stats router (npm i express)");
  const router = express.Router();
  const dbPath = resolveDbPath(opts.dbPath);

  router.get('/stats', (req, res) => {
    res.set('Cache-Control', 'public, max-age=15');
    res.json(computeStats(dbPath));
  });

  return router;
}

// Default export keeps the documented mount line trivial: app.use('/api', require('./api/stats'));
// Without express (e.g. unit tests), exports the bare helpers instead of a router.
if (express) {
  module.exports = createStatsRouter();
  module.exports.createStatsRouter = createStatsRouter;
  module.exports.computeStats = computeStats;
  module.exports.resolveDbPath = resolveDbPath;
} else {
  module.exports = { createStatsRouter, computeStats, resolveDbPath };
}
