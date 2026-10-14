'use strict';
/**
 * Provenance-field tests — CONTRACT.md §2.
 * Every data response carries top-level `source` and `asOfBlock`.
 * The CSV export carries them as response headers (X-Source / X-As-Of-Block).
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  getJSON,
  assertJsonContentType,
  ADDR_A,
} = require('./_harness');

function assertProvenance(assert, body, expectedSource) {
  assert.ok('source' in body, 'response must include top-level "source"');
  assert.ok('asOfBlock' in body, 'response must include top-level "asOfBlock"');
  assert.strictEqual(body.source, expectedSource);
  assert.ok(
    body.asOfBlock === null || (Number.isInteger(body.asOfBlock) && body.asOfBlock >= 0),
    'asOfBlock must be a non-negative integer or null'
  );
}

describe('source / asOfBlock provenance', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('health indexer watermark carries source + asOfBlock', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/health');
    assert.ok(body.indexer, 'health must include indexer section');
    assert.strictEqual(body.indexer.source, 'indexer');
    assert.ok('asOfBlock' in body.indexer);
    assert.strictEqual(body.indexer.asOfBlock, null, 'fresh DB: null watermark, not zero');
  });

  it('activity response carries source=indexer and asOfBlock', async () => {
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}/activity`);
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
    assertProvenance(assert, body, 'indexer');
    assert.strictEqual(body.asOfBlock, null, 'fresh DB: null, not a fabricated block');
  });

  it('stats response carries source=indexer and asOfBlock', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/stats');
    assert.strictEqual(res.status, 200);
    assertProvenance(assert, body, 'indexer');
  });

  it('CSV export carries provenance as X-Source / X-As-Of-Block headers', async () => {
    const res = await fetch(`${srv.baseUrl}/api/v1/activity/export?account=${ADDR_A}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-source'), 'indexer');
    // Null watermark -> header omitted (never a fabricated block number).
    assert.strictEqual(res.headers.get('x-as-of-block'), null);
  });

  it('RPC_UNAVAILABLE error carries error.source=rpc and null asOfBlock', async () => {
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}/sessions`);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(body.error.source, 'rpc');
    assert.ok('asOfBlock' in body.error || 'asOfBlock' in body);
    const block = 'asOfBlock' in body.error ? body.error.asOfBlock : body.asOfBlock;
    assert.strictEqual(block, null);
  });
});
