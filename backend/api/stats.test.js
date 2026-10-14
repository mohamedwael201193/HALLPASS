'use strict';
/**
 * Stats tests — CONTRACT.md §4.5.
 * "Stats from events, never a private DB" (bible §2.3): counts must be real
 * SELECTs over the event cache. The honest fixture is the empty database, so
 * the real counts are zeros — asserted exactly, with types.
 *
 * NOTE: non-zero counts can only come from the indexer's real event pipeline
 * (backend/indexer/index.js) against Arc mainnet. These tests deliberately do
 * NOT seed fake rows — that would be fake chain data.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  getJSON,
  assertJsonContentType,
  ADDR_A,
} = require('./_harness');

describe('GET /api/v1/stats — real counts', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('returns 200 JSON with the full stats shape', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/stats');
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
    for (const key of [
      'accounts',
      'spendsAllowed',
      'spendsBlocked',
      'volumeAllowedRaw',
      'volumeAllowed',
      'source',
      'asOfBlock',
    ]) {
      assert.ok(key in body, `stats response must include "${key}"`);
    }
  });

  it('empty database yields exact zero counts with correct types', async () => {
    const { body } = await getJSON(srv.baseUrl, '/api/v1/stats');
    assert.strictEqual(body.accounts, 0);
    assert.strictEqual(body.spendsAllowed, 0);
    assert.strictEqual(body.spendsBlocked, 0);
    assert.strictEqual(typeof body.accounts, 'number');
    assert.strictEqual(typeof body.spendsAllowed, 'number');
    assert.strictEqual(typeof body.spendsBlocked, 'number');
    // Volumes are decimal strings (base units / human), never floats.
    assert.strictEqual(typeof body.volumeAllowedRaw, 'string');
    assert.strictEqual(typeof body.volumeAllowed, 'string');
    assert.strictEqual(body.volumeAllowedRaw, '0');
    assert.strictEqual(body.volumeAllowed, '0');
    assert.ok(!body.volumeAllowed.includes('e'), 'volume must not use exponent notation');
  });

  it('stats are consistent with the (empty) activity feed from the same store', async () => {
    const stats = (await getJSON(srv.baseUrl, '/api/v1/stats')).body;
    const activity = (
      await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}/activity?limit=500`)
    ).body;
    assert.deepStrictEqual(activity.items, []);
    assert.strictEqual(stats.spendsAllowed + stats.spendsBlocked, 0);
    assert.strictEqual(stats.source, 'indexer');
    assert.strictEqual(stats.asOfBlock, null);
    assert.strictEqual(activity.asOfBlock, null, 'both read the same empty event cache');
  });
});
