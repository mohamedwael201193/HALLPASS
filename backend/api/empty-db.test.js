'use strict';
/**
 * Empty-DB honesty tests — CONTRACT.md §6.
 * The honest fixture is a FRESH, EMPTY SQLite database: no seeded rows, no fake
 * chain data. Every list endpoint must return empty results (200), never 500s.
 * RPC-backed endpoints must 503 RPC_UNAVAILABLE with the labeled error shape —
 * never fake data — because tests run without RPC_URL.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  getJSON,
  assertErrorEnvelope,
  assertJsonContentType,
  ADDR_A,
} = require('./_harness');

const EXPECTED_CSV_HEADER =
  'kind,tx_hash,block_number,log_index,session_key,to_address,token,amount,amount_raw,reason_code,reason_text,policy_hash,timestamp_iso';

describe('empty-DB honesty', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('activity: 200 with empty items, null cursor, indexer source, null asOfBlock', async () => {
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}/activity`);
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
    assert.deepStrictEqual(body.items, []);
    assert.strictEqual(body.nextCursor, null);
    assert.strictEqual(body.source, 'indexer');
    assert.strictEqual(body.asOfBlock, null);
    assert.strictEqual(body.limit, 50);
  });

  it('activity filters (kind=blocked / kind=allowed) return empty 200s, not 500s', async () => {
    for (const kind of ['blocked', 'allowed']) {
      const { res, body } = await getJSON(
        srv.baseUrl,
        `/api/v1/accounts/${ADDR_A}/activity?kind=${kind}&limit=10`
      );
      assert.strictEqual(res.status, 200, `kind=${kind}`);
      assert.deepStrictEqual(body.items, [], `kind=${kind}`);
      assert.strictEqual(body.kind, kind);
    }
  });

  it('stats: 200 with real zero counts on an empty database', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/stats');
    assert.strictEqual(res.status, 200);
    assertJsonContentType(assert, res);
    assert.strictEqual(body.accounts, 0);
    assert.strictEqual(body.spendsAllowed, 0);
    assert.strictEqual(body.spendsBlocked, 0);
    assert.strictEqual(body.volumeAllowedRaw, '0');
    assert.strictEqual(body.volumeAllowed, '0');
    assert.strictEqual(body.source, 'indexer');
    assert.strictEqual(body.asOfBlock, null);
  });

  it('export: 200 CSV with header row only on an empty database', async () => {
    const res = await fetch(`${srv.baseUrl}/api/v1/activity/export?account=${ADDR_A}`);
    assert.strictEqual(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.startsWith('text/csv'), `expected text/csv, got ${JSON.stringify(ct)}`);
    const cd = res.headers.get('content-disposition') || '';
    assert.ok(cd.includes('attachment'), 'export must be an attachment');
    assert.ok(cd.includes('hallpass-activity.csv'), 'export filename must be hallpass-activity.csv');
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 1, 'empty DB must yield exactly the header row');
    assert.strictEqual(lines[0], EXPECTED_CSV_HEADER);
  });

  it('export without account filter also yields header-only CSV', async () => {
    const res = await fetch(`${srv.baseUrl}/api/v1/activity/export`);
    assert.strictEqual(res.status, 200);
    const lines = (await res.text()).split('\n').filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0], EXPECTED_CSV_HEADER);
  });

  it('account status without RPC: 503 RPC_UNAVAILABLE with labeled error shape', async () => {
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}`);
    assert.strictEqual(res.status, 503);
    assertJsonContentType(assert, res);
    const err = assertErrorEnvelope(assert, body, 'RPC_UNAVAILABLE');
    assert.strictEqual(err.source, 'rpc');
    assert.ok(err.message.includes('RPC_URL'), 'message must name the next action (set RPC_URL)');
  });

  it('sessions without RPC: 503 RPC_UNAVAILABLE with labeled error shape', async () => {
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${ADDR_A}/sessions`);
    assert.strictEqual(res.status, 503);
    assertJsonContentType(assert, res);
    const err = assertErrorEnvelope(assert, body, 'RPC_UNAVAILABLE');
    assert.strictEqual(err.source, 'rpc');
  });
});
