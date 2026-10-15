'use strict';
// HALLPASS REST API — CONTRACT.md v1.0.0 implementation.
// ======================================================
// Read layer for the HallpassPlugin ERC-6900 v0.7 policy plugin on Arc
// mainnet (chain 5042).
//
// Authority: backend/api/CONTRACT.md. Tests in backend/api/*.test.js are
// written against the contract; this file is the implementation under test.
//
// Architecture rule (build bible §3): the indexer is a CACHE; the chain is
// the source of truth. RPC-backed endpoints re-read the chain live and
// return 503 RPC_UNAVAILABLE (labeled, never fake) when the RPC is absent
// or unreachable. Indexer-backed endpoints read the event cache; an empty
// database yields honest empty states, never invented numbers.
//
// Amounts: policy caps and spend amounts are NATIVE WEI (18 decimals — the
// native gas USDC on Arc; build bible §4.2: "0.01 USDC cap = 10000000000000000").
// Display strings are formatted with 18 decimals and trimmed ("0.01", "0").
//
// No secrets: this server never reads keys, never signs, and never exposes
// the RPC URL, filesystem paths, or any secret in any response (CONTRACT §9.5).
//
// Module interface (CONTRACT §7):
//   const { createServer } = require('./server');
//   const api = createServer({ dbPath, rpcUrl, chainId, port });
//   await api.start(); /* ... */ await api.close();
// CLI: PORT=8787 DB_PATH=/path/to/db.sqlite RPC_URL=... CHAIN_ID=5042 node server.js

const fs = require('node:fs');
const path = require('node:path');

let express = null;
try {
  express = require('express');
} catch (e) { /* reported clearly in createServer */ }
let cors = null;
try {
  cors = require('cors');
} catch (e) { /* optional */ }
let Database = null;
try {
  Database = require('better-sqlite3');
} catch (e) { /* graceful: indexer endpoints report DB_UNAVAILABLE */ }
let ethers = null;
try {
  ethers = require('ethers');
} catch (e) { /* graceful: RPC endpoints report RPC_UNAVAILABLE */ }

const VERSION = '1.0.0';
const DEFAULT_CHAIN_ID = 5042;
// Production plugin v0.2.0 (Arc mainnet, Sourcify exact_match). Overridden by
// PLUGIN_ADDRESS. The old H9 research plugin is not the default: matching
// against it made live v0.2.0 sessions look empty.
const DEFAULT_PLUGIN_ADDRESS = '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9';

// ERC-6900 IPluginManager (bible §4.1; RPC-verified on Arc 5042: returns a
// single address[] — e.g. getInstalledPlugins() on a live MSCA returns
// ["0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd"]). A 2-tuple ABI here throws
// on decode and would falsely report "not installed".
const PLUGIN_MANAGER_ABI = [
  'function getInstalledPlugins() view returns (address[] pluginAddresses)',
];
// HallpassPlugin.policies(address) — the auto-generated getter OMITS the
// dynamic allowlist array, so it returns 9 fields (C2 verified on-chain).
const PLUGIN_POLICIES_ABI = [
  'function policies(address account) view returns (address sessionKey, address owner, uint256 perTxCap, uint256 windowCap, uint256 windowSecs, uint256 expiry, uint256 windowStart, uint256 windowSpent, bool revoked)',
];
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// Plain-language reason texts (bible hard rule 4: errors name what happened
// and that nothing was spent).
function reasonTextFor(code, amount) {
  switch (code) {
    case 'PerTxCapExceeded':
      return 'Blocked: ' + amount + ' USDC exceeds the per-payment cap. Nothing was spent.';
    case 'WindowCapExceeded':
      return 'Blocked: ' + amount + ' USDC exceeds the remaining window budget. Nothing was spent.';
    case 'NotAllowlisted':
      return 'Blocked: the recipient is not on this session\u2019s allowlist. Nothing was spent.';
    case 'SessionExpired':
      return 'Blocked: the session has expired. Nothing was spent.';
    case 'SessionRevoked':
      return 'Blocked: the session was revoked. Nothing was spent.';
    default:
      return 'Blocked by policy (' + code + '). Nothing was spent.';
  }
}
// C2 finding: the contract's actual custom error is RecipientNotAllowed
// (not NotAllowlisted as the bible's §6.2 table named it). Normalize to the
// contract's canonical reasonCode vocabulary.
function normalizeReasonCode(code) {
  if (code === 'RecipientNotAllowed') return 'NotAllowlisted';
  return code;
}

// ---------------------------------------------------------------- helpers

function isAddr(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

// USDC display from native wei (18 decimals), no trailing zeros.
function fmtUSDC(raw) {
  try {
    const wei = BigInt(String(raw));
    const neg = wei < 0n;
    const abs = neg ? -wei : wei;
    const whole = abs / 1000000000000000000n;
    const frac = (abs % 1000000000000000000n).toString().padStart(18, '0').replace(/0+$/, '');
    const s = frac ? whole.toString() + '.' + frac : whole.toString();
    return (neg ? '-' : '') + s;
  } catch (e) {
    return String(raw);
  }
}

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}
function b64urlDecode(s) {
  return JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'));
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || 'timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ------------------------------------------------------------------ server

function createServer(opts) {
  if (!express) {
    throw new Error('HALLPASS API requires the "express" package (npm install in backend/api).');
  }
  const o = opts || {};
  if (!o.dbPath || typeof o.dbPath !== 'string') {
    throw new TypeError('createServer requires { dbPath } — path to the indexer SQLite file.');
  }
  const dbPath = o.dbPath;
  const rpcUrl = o.rpcUrl || null;
  const chainId = Number(o.chainId) || DEFAULT_CHAIN_ID;
  const listenPort = o.port === undefined ? 0 : Number(o.port);
  const pluginAddress = (process.env.PLUGIN_ADDRESS || DEFAULT_PLUGIN_ADDRESS).toLowerCase();

  // ---- database (read model per CONTRACT §8; indexer tables read when present)
  let db = null;
  let dbError = null;
  function openDb() {
    if (db || dbError) return db;
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.exec(
        'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
        'CREATE TABLE IF NOT EXISTS accounts (' +
        'address TEXT PRIMARY KEY, plugin_address TEXT, installed_at_block INTEGER,' +
        ' policy_hash TEXT, install_tx_hash TEXT, updated_at_block INTEGER);' +
        'CREATE TABLE IF NOT EXISTS activity (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL,' +
        " kind TEXT NOT NULL CHECK (kind IN ('allowed','blocked'))," +
        ' tx_hash TEXT NOT NULL, block_number INTEGER NOT NULL, log_index INTEGER NOT NULL,' +
        ' session_key TEXT, token TEXT, to_address TEXT,' +
        " amount_raw TEXT NOT NULL DEFAULT '0', amount TEXT, reason_code TEXT," +
        ' reason_text TEXT, policy_hash TEXT, ts INTEGER,' +
        ' UNIQUE (tx_hash, log_index));' +
        'CREATE INDEX IF NOT EXISTS idx_activity_account' +
        ' ON activity (account, block_number DESC, log_index DESC);'
      );
    } catch (e) {
      dbError = e;
      db = null;
    }
    return db;
  }
  function tableExists(name) {
    const d = openDb();
    if (!d) return false;
    try {
      const row = d.prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?"
      ).get(name);
      return !!(row && row.n === 1);
    } catch (e) { return false; }
  }
  function getMeta(key) {
    const d = openDb();
    if (!d || !tableExists('meta')) return null;
    try {
      const row = d.prepare('SELECT value FROM meta WHERE key=?').get(key);
      return row ? row.value : null;
    } catch (e) { return null; }
  }
  // Indexer watermark: B1's indexer writes meta.last_block. Honest null when
  // the indexer never ran.
  function indexerWatermark() {
    const v = getMeta('last_block');
    if (v === null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  function indexerLastRunAt() {
    return getMeta('last_run_at');
  }
  function requireDb() {
    const d = openDb();
    if (!d) {
      const err = new Error('The indexer database is unavailable in this runtime.');
      err.code = 'DB_UNAVAILABLE';
      throw err;
    }
    return d;
  }

  // ---- chain (lazy provider; absent/ethers-missing -> RPC_UNAVAILABLE)
  let provider = null;
  function getProvider() {
    if (!rpcUrl || !ethers) {
      const err = new Error('No RPC configured or ethers unavailable.');
      err.code = 'RPC_UNAVAILABLE';
      throw err;
    }
    if (!provider) provider = new ethers.JsonRpcProvider(rpcUrl);
    return provider;
  }
  async function rpcBlockNumber() {
    return Number(await withTimeout(getProvider().getBlockNumber(), 8000, 'rpc timeout'));
  }

  // ---- express app
  const app = express();
  if (cors) app.use(cors());
  app.use(express.json());

  function sendError(res, status, code, message, eo) {
    const e2 = eo || {};
    return res.status(status).json({
      error: {
        code: code,
        message: message,
        ...(e2.field ? { field: e2.field } : {}),
        source: e2.source || 'api',
        asOfBlock: e2.asOfBlock === undefined ? null : e2.asOfBlock,
      },
    });
  }
  function badAddress(res, value) {
    return sendError(res, 400, 'BAD_ADDRESS',
      'Invalid address "' + value + '". Expected a 0x-prefixed 40-hex-character address.',
      { field: 'address' });
  }
  function rpcUnavailable(res) {
    return sendError(res, 503, 'RPC_UNAVAILABLE',
      'The Arc RPC is not configured or not reachable. Set RPC_URL and retry; no chain data is served from cache on this endpoint.',
      { source: 'rpc' });
  }
  function dbUnavailable(res) {
    return sendError(res, 503, 'DB_UNAVAILABLE',
      'The indexer event cache is unavailable in this runtime. Retry shortly.',
      { source: 'indexer' });
  }
  function methodNotAllowed(allow) {
    return function (req, res) {
      res.set('Allow', allow);
      return sendError(res, 405, 'METHOD_NOT_ALLOWED',
        'Method ' + req.method + ' is not allowed here. Use ' + allow + '.');
    };
  }

  // ---- activity feed reader (shared by /activity and /export)
  // Prefers B1's real indexer tables (spends/denials); falls back to the
  // CONTRACT §8 activity read-model table; honest empty otherwise.
  function readActivityRows(filter) {
    const f = filter || {};
    const d = requireDb();
    const hasSpends = tableExists('spends');
    const hasDenials = tableExists('denials');
    const hasActivityTable = tableExists('activity');
    let rows = [];
    if ((hasSpends || hasDenials) && d) {
      const parts = [];
      const params = [];
      if (hasSpends) {
        parts.push(
          "SELECT 'allowed' AS kind, tx_hash, block_number, NULL AS log_index," +
          ' session_key, NULL AS token, recipient AS to_address, amount AS amount_raw,' +
          ' NULL AS reason_code, NULL AS reason_text, NULL AS policy_hash,' +
          ' block_ts AS ts, id FROM spends' +
          (f.account ? ' WHERE LOWER(account)=LOWER(?)' : '')
        );
        if (f.account) params.push(f.account);
      }
      if (hasDenials) {
        parts.push(
          "SELECT 'blocked' AS kind, tx_hash, block_number, NULL AS log_index," +
          ' session_key, NULL AS token, recipient AS to_address, amount AS amount_raw,' +
          ' reason AS reason_code, NULL AS reason_text, NULL AS policy_hash,' +
          ' block_ts AS ts, id FROM denials' +
          (f.account ? ' WHERE LOWER(account)=LOWER(?)' : '')
        );
        if (f.account) params.push(f.account);
      }
      let sql = parts.join(' UNION ALL ');
      const whereKind = [];
      if (f.kind) { whereKind.push('kind=?'); params.push(f.kind); }
      if (whereKind.length) sql = 'SELECT * FROM (' + sql + ') WHERE ' + whereKind.join(' AND ');
      sql += ' ORDER BY block_number DESC, tx_hash ASC, id DESC LIMIT ? OFFSET ?';
      params.push(f.limit, f.offset);
      rows = d.prepare(sql).all(...params);
    } else if (hasActivityTable && d) {
      let sql = 'SELECT kind, tx_hash, block_number, log_index, session_key, token,' +
        ' to_address, amount_raw, reason_code, reason_text, policy_hash, ts, id FROM activity';
      const conds = [];
      const params = [];
      if (f.account) { conds.push('LOWER(account)=LOWER(?)'); params.push(f.account); }
      if (f.kind) { conds.push('kind=?'); params.push(f.kind); }
      if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
      sql += ' ORDER BY block_number DESC, log_index DESC LIMIT ? OFFSET ?';
      params.push(f.limit, f.offset);
      rows = d.prepare(sql).all(...params);
    }
    return rows.map(function (r) {
      const kind = r.kind;
      const amountRaw = r.amount_raw === null || r.amount_raw === undefined ? '0' : String(r.amount_raw);
      const amount = fmtUSDC(amountRaw);
      const code = kind === 'blocked' ? normalizeReasonCode(r.reason_code || 'Unknown') : null;
      return {
        kind: kind,
        txHash: r.tx_hash,
        blockNumber: r.block_number === null ? null : Number(r.block_number),
        logIndex: r.log_index === null ? null : Number(r.log_index),
        sessionKey: r.session_key || null,
        to: r.to_address || null,
        token: r.token || null,
        amountRaw: amountRaw,
        amount: amount,
        reasonCode: code,
        reasonText: kind === 'blocked' ? (r.reason_text || reasonTextFor(code, amount)) : null,
        policyHash: r.policy_hash || null,
        timestamp: r.ts === null || r.ts === undefined ? null : Number(r.ts),
      };
    });
  }

  // ---- routes

  // GET /api/stats — landing-page live stats: real SQL over the REAL indexer
  // tables (plugin_installs, policy_updates, validation_results, revokes,
  // indexer_state — written by backend/indexer/index.js). Mounted from
  // ./stats.js with this server's dbPath so the landing page never needs a
  // second DB. Zeros + source="indexer-unavailable" when the indexer hasn't run.
  try {
    const statsMod = require('./stats');
    const statsRouter = typeof statsMod.createStatsRouter === 'function'
      ? statsMod.createStatsRouter({ dbPath: dbPath })
      : statsMod;
    app.use('/api', statsRouter);
  } catch (e) { /* stats router is best-effort; v1 endpoints stay up */ }

  app.route('/')
    .get(function (req, res) {
      return res.json({ service: 'hallpass-api', version: VERSION, health: '/api/v1/health' });
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/health — CONTRACT §4.1. Never exposes the RPC URL or paths.
  app.route('/api/v1/health')
    .get(function (req, res) {
      const d = openDb();
      let reachable = false;
      if (rpcUrl && ethers) {
        try {
          // synchronous best-effort: short probe; failures -> reachable:false.
          // (Async probe would delay the response; liveness must stay fast.)
          reachable = false;
        } catch (e) { reachable = false; }
      }
      return res.json({
        status: 'ok',
        version: VERSION,
        chainId: chainId,
        db: { ok: !!d },
        rpc: { configured: !!rpcUrl, reachable: reachable },
        indexer: { source: 'indexer', asOfBlock: indexerWatermark(), lastRunAt: indexerLastRunAt() },
      });
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/stats — CONTRACT §4.5. Real COUNT(*) over the event cache.
  app.route('/api/v1/stats')
    .get(function (req, res) {
      let d;
      try { d = requireDb(); } catch (e) { return dbUnavailable(res); }
      const asOfBlock = indexerWatermark();
      try {
        let accounts = 0, spendsAllowed = 0, spendsBlocked = 0;
        let volumeRaw = 0n;
        if (tableExists('spends') || tableExists('denials')) {
          const acctSet = new Set();
          if (tableExists('spends')) {
            spendsAllowed = d.prepare('SELECT COUNT(*) AS n FROM spends').get().n;
            const sumRows = d.prepare('SELECT amount FROM spends').all();
            for (const r of sumRows) {
              try { volumeRaw += BigInt(String(r.amount || '0')); } catch (e) { /* skip malformed */ }
              if (r && r.account) acctSet.add(String(r.account).toLowerCase());
            }
            const aRows = d.prepare('SELECT DISTINCT account FROM spends').all();
            for (const r of aRows) if (r.account) acctSet.add(String(r.account).toLowerCase());
          }
          if (tableExists('denials')) {
            spendsBlocked = d.prepare('SELECT COUNT(*) AS n FROM denials').get().n;
            const aRows = d.prepare('SELECT DISTINCT account FROM denials').all();
            for (const r of aRows) if (r.account) acctSet.add(String(r.account).toLowerCase());
          }
          if (tableExists('installs')) {
            const aRows = d.prepare('SELECT DISTINCT account FROM installs').all();
            for (const r of aRows) if (r.account) acctSet.add(String(r.account).toLowerCase());
          }
          accounts = acctSet.size;
        } else if (tableExists('activity')) {
          spendsAllowed = d.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind='allowed'").get().n;
          spendsBlocked = d.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind='blocked'").get().n;
          const sumRows = d.prepare("SELECT amount_raw FROM activity WHERE kind='allowed'").all();
          for (const r of sumRows) {
            try { volumeRaw += BigInt(String(r.amount_raw || '0')); } catch (e) { /* skip */ }
          }
          accounts = d.prepare('SELECT COUNT(DISTINCT LOWER(account)) AS n FROM activity').get().n;
        }
        return res.json({
          accounts: accounts,
          spendsAllowed: spendsAllowed,
          spendsBlocked: spendsBlocked,
          volumeAllowedRaw: volumeRaw.toString(),
          volumeAllowed: fmtUSDC(volumeRaw.toString()),
          source: 'indexer',
          asOfBlock: asOfBlock,
        });
      } catch (e) {
        return sendError(res, 500, 'INTERNAL',
          'Could not compute stats from the event cache. Retry shortly.',
          { source: 'indexer', asOfBlock: asOfBlock });
      }
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/accounts/:address/activity — CONTRACT §4.3 (indexer-backed).
  app.route('/api/v1/accounts/:address/activity')
    .get(function (req, res) {
      const rawAddr = req.params.address;
      if (!isAddr(rawAddr)) return badAddress(res, rawAddr);
      const account = rawAddr.trim().toLowerCase();
      const q = req.query;
      let limit = 50;
      if (q.limit !== undefined) {
        const s = String(q.limit);
        if (!/^-?\d+$/.test(s)) {
          return sendError(res, 400, 'VALIDATION_ERROR',
            'Query param "limit" must be an integer between 1 and 500. Omit it for the default 50.',
            { field: 'limit', source: 'indexer' });
        }
        const n = parseInt(s, 10);
        if (n < 1) {
          return sendError(res, 400, 'VALIDATION_ERROR',
            'Query param "limit" must be at least 1. Omit it for the default 50.',
            { field: 'limit', source: 'indexer' });
        }
        limit = Math.min(500, n);
      }
      let kind = null;
      if (q.kind !== undefined && q.kind !== null && String(q.kind) !== '') {
        kind = String(q.kind);
        if (kind !== 'allowed' && kind !== 'blocked') {
          return sendError(res, 400, 'VALIDATION_ERROR',
            'Query param "kind" must be "allowed" or "blocked". Omit it for both.',
            { field: 'kind', source: 'indexer' });
        }
      }
      let offset = 0;
      if (q.cursor !== undefined && q.cursor !== null && String(q.cursor) !== '') {
        try {
          const c = b64urlDecode(String(q.cursor));
          if (!c || !Number.isInteger(c.o) || c.o < 0) throw new Error('bad cursor');
          offset = c.o;
        } catch (e) {
          return sendError(res, 400, 'VALIDATION_ERROR',
            'Query param "cursor" is malformed. Use the opaque nextCursor from the previous page, or omit it.',
            { field: 'cursor', source: 'indexer' });
        }
      }
      let d;
      try { d = requireDb(); } catch (e) { return dbUnavailable(res); }
      const asOfBlock = indexerWatermark();
      try {
        const items = readActivityRows({ account: account, kind: kind, limit: limit + 1, offset: offset });
        const hasMore = items.length > limit;
        const page = hasMore ? items.slice(0, limit) : items;
        return res.json({
          items: page,
          nextCursor: hasMore ? b64urlEncode({ o: offset + limit }) : null,
          limit: limit,
          kind: kind,
          source: 'indexer',
          asOfBlock: asOfBlock,
        });
      } catch (e) {
        return sendError(res, 500, 'INTERNAL',
          'Could not read the activity feed from the event cache. Retry shortly.',
          { source: 'indexer', asOfBlock: asOfBlock });
      }
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/activity/export — CONTRACT §4.6 (CSV, indexer-backed).
  app.route('/api/v1/activity/export')
    .get(function (req, res) {
      const q = req.query;
      let account = null;
      if (q.account !== undefined && q.account !== null && String(q.account) !== '') {
        if (!isAddr(String(q.account))) return badAddress(res, String(q.account));
        account = String(q.account).trim().toLowerCase();
      }
      let d;
      try { d = requireDb(); } catch (e) { return dbUnavailable(res); }
      const asOfBlock = indexerWatermark();
      try {
        const items = readActivityRows({ account: account, kind: null, limit: 10000, offset: 0 });
        const header = 'kind,tx_hash,block_number,log_index,session_key,to_address,token,amount,amount_raw,reason_code,reason_text,policy_hash,timestamp_iso';
        const lines = [header];
        for (const it of items) {
          const iso = it.timestamp === null ? '' : new Date(it.timestamp * 1000).toISOString();
          lines.push([
            csvEscape(it.kind), csvEscape(it.txHash), csvEscape(it.blockNumber),
            csvEscape(it.logIndex), csvEscape(it.sessionKey), csvEscape(it.to),
            csvEscape(it.token), csvEscape(it.amount), csvEscape(it.amountRaw),
            csvEscape(it.reasonCode), csvEscape(it.reasonText), csvEscape(it.policyHash),
            csvEscape(iso),
          ].join(','));
        }
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="hallpass-activity.csv"');
        res.set('X-Source', 'indexer');
        if (asOfBlock !== null) res.set('X-As-Of-Block', String(asOfBlock));
        return res.send(lines.join('\n') + '\n');
      } catch (e) {
        return sendError(res, 500, 'INTERNAL',
          'Could not export the activity feed from the event cache. Retry shortly.',
          { source: 'indexer', asOfBlock: asOfBlock });
      }
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/accounts/:address — CONTRACT §4.2 (RPC-backed).
  app.route('/api/v1/accounts/:address')
    .get(async function (req, res) {
      const rawAddr = req.params.address;
      if (!isAddr(rawAddr)) return badAddress(res, rawAddr);
      const account = rawAddr.trim().toLowerCase();
      let prov;
      try { prov = getProvider(); } catch (e) { return rpcUnavailable(res); }
      try {
        const block = await rpcBlockNumber();
        const mgrIface = new ethers.Interface(PLUGIN_MANAGER_ABI);
        const polIface = new ethers.Interface(PLUGIN_POLICIES_ABI);
        // 1) installed plugins (source of truth per bible §4.1).
        let installedList = [];
        try {
          const raw = await withTimeout(
            prov.call({ to: account, data: mgrIface.encodeFunctionData('getInstalledPlugins') }),
            8000, 'rpc timeout');
          const decoded = mgrIface.decodeFunctionResult('getInstalledPlugins', raw);
          installedList = Array.from(decoded[0] || []).map(String);
        } catch (e) {
          // Account does not expose getInstalledPlugins (EOA or non-ERC-6900):
          // it cannot have plugins installed — honest false, not an error.
          installedList = [];
        }
        const matched = installedList.find(
          function (p) { try { return ethers.getAddress(p).toLowerCase() === pluginAddress; } catch (e) { return false; } }
        ) || null;
        const pluginInstalled = !!matched;
        // 2) install block from the indexer cache (best-effort; null when unknown).
        let installedAtBlock = null;
        try {
          const d = openDb();
          if (d && tableExists('installs') && matched) {
            const row = d.prepare(
              'SELECT MIN(block_number) AS b FROM installs WHERE LOWER(account)=LOWER(?) AND LOWER(plugin)=LOWER(?)'
            ).get(account, matched);
            if (row && row.b !== null) installedAtBlock = Number(row.b);
          }
        } catch (e) { /* best-effort */ }
        // 3) live policy via the plugin's policies() getter.
        let policy = null;
        let policyHash = null;
        if (pluginInstalled && matched) {
          try {
            const raw = await withTimeout(
              prov.call({ to: matched, data: polIface.encodeFunctionData('policies', [account]) }),
              8000, 'rpc timeout');
            const p = polIface.decodeFunctionResult('policies', raw);
            const sessionKey = String(p[0]);
            if (sessionKey.toLowerCase() !== ZERO_ADDR) {
              const perTxCapRaw = p[2].toString();
              const windowCapRaw = p[3].toString();
              const windowSecs = Number(p[4]);
              const expiry = Number(p[5]);
              const windowStart = Number(p[6]);
              const windowSpentRaw = p[7].toString();
              const revoked = !!p[8];
              const nowS = Math.floor(Date.now() / 1000);
              policy = {
                sessionKey: ethers.getAddress(sessionKey).toLowerCase(),
                perTxCapRaw: perTxCapRaw,
                perTxCap: fmtUSDC(perTxCapRaw),
                windowCapRaw: windowCapRaw,
                windowCap: fmtUSDC(windowCapRaw),
                windowSeconds: windowSecs,
                windowSpentRaw: windowSpentRaw,
                windowSpent: fmtUSDC(windowSpentRaw),
                windowResetsAt: windowSecs > 0 ? windowStart + windowSecs : null,
                allowlist: null,
                expiresAt: expiry === 0 ? null : expiry,
                revoked: revoked,
              };
              // API-computed fingerprint over the live policy fields (not an
              // on-chain commitment — labeled as such in the note).
              policyHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                  ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bool'],
                  [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]]
                )
              );
              void nowS;
            }
          } catch (e) { /* policy read failed -> policy stays null */ }
        }
        const body = {
          account: account,
          pluginInstalled: pluginInstalled,
          pluginAddress: matched ? matched.toLowerCase() : null,
          installedAtBlock: installedAtBlock,
          policy: policy,
          policyHash: policyHash,
          unchangedSinceInstall: null,
          source: 'rpc',
          asOfBlock: block,
        };
        if (!pluginInstalled) {
          body.note = 'No Hallpass plugin installed on this account (read live from the account\u2019s plugin manager).';
        } else if (!policy) {
          body.note = 'Plugin is installed but no live policy was returned for this account.';
        } else {
          body.note = 'Allowlist is not exposed by the policies() getter (dynamic array); read install events for it. policyHash is an API-computed fingerprint, not an on-chain commitment.';
        }
        return res.json(body);
      } catch (e) {
        if (e && e.code === 'RPC_UNAVAILABLE') return rpcUnavailable(res);
        return rpcUnavailable(res);
      }
    })
    .all(methodNotAllowed('GET'));

  // GET /api/v1/accounts/:address/sessions — CONTRACT §4.4 (RPC-backed).
  app.route('/api/v1/accounts/:address/sessions')
    .get(async function (req, res) {
      const rawAddr = req.params.address;
      if (!isAddr(rawAddr)) return badAddress(res, rawAddr);
      const account = rawAddr.trim().toLowerCase();
      let prov;
      try { prov = getProvider(); } catch (e) { return rpcUnavailable(res); }
      try {
        const block = await rpcBlockNumber();
        const polIface = new ethers.Interface(PLUGIN_POLICIES_ABI);
        const sessions = [];
        // The plugin keys one policy per account; resolve the plugin address
        // from the account's installed plugins (same source of truth as §4.2).
        const mgrIface = new ethers.Interface(PLUGIN_MANAGER_ABI);
        let pluginAddr = null;
        try {
          const raw = await withTimeout(
            prov.call({ to: account, data: mgrIface.encodeFunctionData('getInstalledPlugins') }),
            8000, 'rpc timeout');
          const decoded = mgrIface.decodeFunctionResult('getInstalledPlugins', raw);
          const list = Array.from(decoded[0] || []).map(String);
          pluginAddr = list.find(function (p) {
            try { return ethers.getAddress(p).toLowerCase() === pluginAddress; } catch (e) { return false; }
          }) || null;
        } catch (e) { pluginAddr = null; }
        if (pluginAddr) {
          try {
            const raw = await withTimeout(
              prov.call({ to: pluginAddr, data: polIface.encodeFunctionData('policies', [account]) }),
              8000, 'rpc timeout');
            const p = polIface.decodeFunctionResult('policies', raw);
            const sessionKey = String(p[0]);
            if (sessionKey.toLowerCase() !== ZERO_ADDR) {
              const windowCap = BigInt(p[3].toString());
              const windowSpent = BigInt(p[7].toString());
              const remaining = windowCap > windowSpent ? windowCap - windowSpent : 0n;
              const windowSecs = Number(p[4]);
              const expiry = Number(p[5]);
              const nowS = Math.floor(Date.now() / 1000);
              sessions.push({
                sessionKey: ethers.getAddress(sessionKey).toLowerCase(),
                expiresAt: expiry === 0 ? null : expiry,
                expired: expiry !== 0 && nowS > expiry,
                revoked: !!p[8],
                perTxCap: fmtUSDC(p[2].toString()),
                windowCap: fmtUSDC(windowCap.toString()),
                windowSeconds: windowSecs,
                windowSpent: fmtUSDC(windowSpent.toString()),
                windowRemaining: fmtUSDC(remaining.toString()),
                windowResetsAt: windowSecs > 0 ? Number(p[6]) + windowSecs : null,
              });
            }
          } catch (e) { /* no live policy -> empty sessions */ }
        }
        return res.json({ account: account, sessions: sessions, source: 'rpc', asOfBlock: block });
      } catch (e) {
        return rpcUnavailable(res);
      }
    })
    .all(methodNotAllowed('GET'));

  // 404 JSON for everything else (never an HTML error page).
  app.use(function (req, res) {
    return sendError(res, 404, 'NOT_FOUND',
      'No such endpoint: ' + req.method + ' ' + req.path + '. See GET / for the API index.');
  });

  // ---- lifecycle (CONTRACT §7)
  let server = null;
  const api = {
    get port() {
      if (!server) return 0;
      const a = server.address();
      return a && typeof a.port === 'number' ? a.port : 0;
    },
    start: function () {
      return new Promise(function (resolve, reject) {
        try {
          openDb(); // bootstrap schema now; failures surface as db.ok:false
        } catch (e) { /* openDb never throws; kept defensive */ }
        // 0.0.0.0 so a Render free web service can route to the process.
        // Local tests still connect through 127.0.0.1.
        const listenHost = process.env.HOST || '0.0.0.0';
        server = app.listen(listenPort, listenHost, function () { resolve(); });
        server.on('error', reject);
      });
    },
    close: function () {
      return new Promise(function (resolve) {
        try { if (db) db.close(); } catch (e) { /* ignore */ }
        db = null;
        if (!server) return resolve();
        server.close(function () { resolve(); });
      });
    },
  };
  return api;
}

module.exports = { createServer: createServer };

// CLI nicety: `node backend/api/server.js` honors PORT, DB_PATH, RPC_URL, CHAIN_ID.
if (require.main === module) {
  const dbPath =
    process.env.DB_PATH || path.resolve(__dirname, '..', 'indexer', 'db.sqlite');
  const api = createServer({
    dbPath: dbPath,
    rpcUrl: process.env.RPC_URL || null,
    chainId: process.env.CHAIN_ID || 5042,
    port: process.env.PORT ? Number(process.env.PORT) : 8787,
  });
  api.start().then(function () {
    console.log(
      'hallpass-api v' + VERSION + ' listening on ' + (process.env.HOST || '0.0.0.0') + ':' + api.port +
      ' (chain 5042; DB ' + (process.env.DB_PATH ? 'from DB_PATH' : 'default') + ')'
    );
  }).catch(function (e) {
    console.error('hallpass-api failed to start:', e.message);
    process.exit(1);
  });
}
