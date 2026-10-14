'use strict';
/**
 * Shared in-process harness for the HALLPASS API contract tests.
 *
 * Target: backend/api/CONTRACT.md. The implementation under test is
 * backend/api/server.js, which MUST export createServer({ dbPath, rpcUrl,
 * chainId, port }) -> { start(), close(), port }.
 *
 * Honesty rules for these tests:
 *  - Real server instance started in-process, real HTTP (global fetch) against
 *    127.0.0.1 on an ephemeral port. No HTTP mocks of our own API.
 *  - Temp SQLite DB per test file, pointed at a path that does NOT exist yet:
 *    the server must bootstrap its schema and serve empty-state honesty.
 *  - Empty DB is the honest fixture: no seeded rows, no fake chain data.
 *  - No RPC_URL is passed: RPC-backed endpoints must 503 RPC_UNAVAILABLE
 *    (labeled honest degrade), never fake data.
 *  - If server.js does not exist yet, every suite fails loudly with
 *    IMPLEMENTATION MISSING. Do NOT write a stub server to make them pass.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// Node 24: `after()` registered inside a `before` hook fires immediately
// after the hook — before any test runs. So teardown is registered once at
// module top level (attaches to the requiring file's root suite, which runs
// after all describes in that file), and startTestServer only enqueues.
const { after: afterSuite } = require('node:test');
const _servers = [];
afterSuite(async () => {
  for (const s of _servers.splice(0)) {
    try { await s.api.close(); } catch (e) { /* ignore */ }
    try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});

const API_DIR = __dirname;
const SERVER_PATH = path.join(API_DIR, 'server.js');

async function loadCreateServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    throw new Error(
      'IMPLEMENTATION MISSING: backend/api/server.js does not exist yet. ' +
        'These tests are written against backend/api/CONTRACT.md and await the implementation. ' +
        'Do NOT write a stub server to make them pass.'
    );
  }
  let mod;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    mod = require(SERVER_PATH);
  } catch (err) {
    if (err && err.code === 'ERR_REQUIRE_ESM') {
      mod = await import(pathToFileURL(SERVER_PATH).href);
    } else {
      throw err;
    }
  }
  const createServer =
    mod.createServer ||
    (mod.default && mod.default.createServer) ||
    mod.default;
  if (typeof createServer !== 'function') {
    throw new Error(
      'CONTRACT VIOLATION: backend/api/server.js must export ' +
        'createServer({ dbPath, rpcUrl, chainId, port }). See CONTRACT.md §7.'
    );
  }
  return createServer;
}

/**
 * Start a real server instance in-process against a fresh temp SQLite DB.
 * Registers teardown on the node:test context `t`.
 * Returns { baseUrl, dbPath, dir }.
 */
async function startTestServer(t, { rpcUrl = null } = {}) {
  const createServer = await loadCreateServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hallpass-api-test-'));
  // NOTE: dbPath intentionally does not exist yet — the server must create
  // the file and bootstrap its schema (CONTRACT.md §7).
  const dbPath = path.join(dir, 'test.db');
  const api = createServer({ dbPath, rpcUrl, chainId: 5042, port: 0 });
  await api.start();
  const port = api.port;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `CONTRACT VIOLATION: api.port must be the bound port after start(), got ${String(port)}.`
    );
  }
  _servers.push({ api, dir });
  return { baseUrl: `http://127.0.0.1:${port}`, dbPath, dir };
}

/** Real HTTP GET against the live server; parses JSON bodies. */
async function getJSON(baseUrl, p, opts = {}) {
  const res = await fetch(baseUrl + p, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text, _parseError: true };
  }
  return { res, body, text };
}

/** Assert the uniform error envelope from CONTRACT.md §3. */
function assertErrorEnvelope(assert, body, expectedCode) {
  assert.ok(body && typeof body === 'object', 'error body must be a JSON object');
  assert.ok(!body._parseError, 'error body must be valid JSON');
  const err = body.error;
  assert.ok(err && typeof err === 'object', 'body.error must be an object');
  assert.strictEqual(typeof err.code, 'string', 'error.code must be a string');
  assert.strictEqual(typeof err.message, 'string', 'error.message must be a string');
  assert.ok(err.message.length > 0, 'error.message must name the next action (non-empty)');
  assert.strictEqual(typeof err.source, 'string', 'error.source must be a string');
  assert.ok('asOfBlock' in err || 'asOfBlock' in body, 'asOfBlock must be present');
  if (expectedCode) {
    assert.strictEqual(err.code, expectedCode, `expected error code ${expectedCode}`);
  }
  return err;
}

function assertJsonContentType(assert, res) {
  const ct = res.headers.get('content-type') || '';
  assert.ok(
    ct.startsWith('application/json'),
    `expected JSON content-type, got ${JSON.stringify(ct)}`
  );
}

// Deterministic well-formed addresses used as fixtures (never real accounts).
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

module.exports = {
  API_DIR,
  SERVER_PATH,
  loadCreateServer,
  startTestServer,
  getJSON,
  assertErrorEnvelope,
  assertJsonContentType,
  ADDR_A,
  ADDR_B,
};
