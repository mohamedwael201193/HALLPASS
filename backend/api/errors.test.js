'use strict';
/**
 * Error-shape tests — CONTRACT.md §3 and §5.
 * Every failure mode returns the uniform JSON error envelope (never HTML),
 * with the specified code and a message that names the next action.
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

describe('error shapes', () => {
  let srv;
  before(async (t) => {
    srv = await startTestServer(t);
  });

  it('malformed address -> 400 BAD_ADDRESS with field and format guidance', async () => {
    for (const bad of ['0x123', 'not-an-address', '0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ']) {
      const { res, body } = await getJSON(
        srv.baseUrl,
        `/api/v1/accounts/${encodeURIComponent(bad)}/activity`
      );
      assert.strictEqual(res.status, 400, `address=${bad}`);
      assertJsonContentType(assert, res);
      const err = assertErrorEnvelope(assert, body, 'BAD_ADDRESS');
      assert.strictEqual(err.field, 'address');
      assert.ok(err.message.includes('0x'), 'message must name the expected 0x format');
    }
  });

  it('uppercase / mixed-case hex address is accepted (case-insensitive)', async () => {
    const mixed = '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD';
    const { res, body } = await getJSON(srv.baseUrl, `/api/v1/accounts/${mixed}/activity`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body.items, []);
  });

  it('bad limit -> 400 VALIDATION_ERROR; limit=0 -> 400; huge limit clamps to 500', async () => {
    const base = `/api/v1/accounts/${ADDR_A}/activity`;
    for (const bad of ['abc', '1.5', '-3', '0']) {
      const { res, body } = await getJSON(srv.baseUrl, `${base}?limit=${bad}`);
      assert.strictEqual(res.status, 400, `limit=${bad}`);
      assertErrorEnvelope(assert, body, 'VALIDATION_ERROR');
    }
    const clamped = await getJSON(srv.baseUrl, `${base}?limit=99999`);
    assert.strictEqual(clamped.res.status, 200, 'limit > 500 clamps, still 200');
    assert.ok(clamped.body.limit <= 500, 'applied limit must be <= 500');
  });

  it('bad kind filter -> 400 VALIDATION_ERROR', async () => {
    const { res, body } = await getJSON(
      srv.baseUrl,
      `/api/v1/accounts/${ADDR_A}/activity?kind=sometimes`
    );
    assert.strictEqual(res.status, 400);
    assertErrorEnvelope(assert, body, 'VALIDATION_ERROR');
  });

  it('garbage cursor -> 400 VALIDATION_ERROR', async () => {
    const { res, body } = await getJSON(
      srv.baseUrl,
      `/api/v1/accounts/${ADDR_A}/activity?cursor=${encodeURIComponent('!!!not-a-cursor!!!')}`
    );
    assert.strictEqual(res.status, 400);
    assertErrorEnvelope(assert, body, 'VALIDATION_ERROR');
  });

  it('unknown query params are ignored (200)', async () => {
    const { res, body } = await getJSON(
      srv.baseUrl,
      `/api/v1/accounts/${ADDR_A}/activity?whatever=1&foo=bar`
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body.items, []);
  });

  it('unknown route -> 404 NOT_FOUND as JSON', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/no-such-route');
    assert.strictEqual(res.status, 404);
    assertJsonContentType(assert, res);
    assertErrorEnvelope(assert, body, 'NOT_FOUND');
  });

  it('wrong method -> 405 METHOD_NOT_ALLOWED with Allow header', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/health', { method: 'POST' });
    assert.strictEqual(res.status, 405);
    assertJsonContentType(assert, res);
    assertErrorEnvelope(assert, body, 'METHOD_NOT_ALLOWED');
    const allow = res.headers.get('allow') || '';
    assert.ok(allow.includes('GET'), `Allow header must include GET, got ${JSON.stringify(allow)}`);
  });

  it('POST on activity endpoint -> 405', async () => {
    const { res, body } = await getJSON(
      srv.baseUrl,
      `/api/v1/accounts/${ADDR_A}/activity`,
      { method: 'POST' }
    );
    assert.strictEqual(res.status, 405);
    assertErrorEnvelope(assert, body, 'METHOD_NOT_ALLOWED');
  });

  it('export with malformed account -> 400 BAD_ADDRESS', async () => {
    const { res, body } = await getJSON(srv.baseUrl, '/api/v1/activity/export?account=xyz');
    assert.strictEqual(res.status, 400);
    assertErrorEnvelope(assert, body, 'BAD_ADDRESS');
  });
});
