'use strict';
/**
 * Health check tests — CONTRACT.md §4.1.
 * Runs against a real in-process server + fresh temp SQLite DB (see _harness.js).
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  getJSON,
  assertJsonContentType,
} = require('./_harness');

describe('GET /api/v1/health', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('returns 200 with JSON content-type', async () => {
    const { res } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
  });

  it('reports status ok, version, and chainId 5042', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(typeof body.version, 'string');
    assert.ok(body.version.length > 0, 'version must be a non-empty string');
    assert.strictEqual(body.chainId, 5042, 'Arc mainnet chain id');
  });

  it('reports db ok on a fresh database', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.ok(body.db && typeof body.db === 'object');
    assert.strictEqual(body.db.ok, true);
  });

  it('honestly reports RPC as not configured / unreachable (no RPC_URL in tests)', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.ok(body.rpc && typeof body.rpc === 'object');
    assert.strictEqual(body.rpc.configured, false);
    assert.strictEqual(body.rpc.reachable, false);
  });

  it('exposes no secrets in the health payload', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    const flat = JSON.stringify(body).toLowerCase();
    for (const banned of ['rpcurl', 'privatekey', 'private_key', 'secret', 'mnemonic', 'apikey', 'api_key']) {
      assert.ok(!flat.includes(`"${banned}"`), `health payload must not contain key ${banned}`);
    }
    assert.ok(!('rpcUrl' in (body.rpc || {})), 'rpc section must not expose the URL');
  });

  it('reports a null indexer watermark on a fresh database (honest, not zero)', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.ok(body.indexer && typeof body.indexer === 'object');
    assert.strictEqual(body.indexer.source, 'indexer');
    assert.strictEqual(body.indexer.asOfBlock, null);
    assert.strictEqual(body.indexer.lastRunAt, null);
  });
});

describe('GET / (root pointer)', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('returns a JSON service pointer', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/');
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
    assert.strictEqual(body.service, 'hallpass-api');
    assert.ok(typeof body.health === 'string' && body.health.length > 0);
  });
});
