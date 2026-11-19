const { test } = require('bun:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifySignature, pushedCommit, releasesToPrune, upstreamHeaders } = require('./lib');

const sign = (secret, body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
const sha = (char) => char.repeat(40);

test('a correctly signed webhook body is accepted', () => {
  const body = '{"ref":"refs/heads/main"}';
  assert.strictEqual(verifySignature('secret', body, sign('secret', body)), true);
});

test('a wrong secret, a changed body or a missing header is rejected', () => {
  const body = '{"ref":"refs/heads/main"}';
  assert.strictEqual(verifySignature('secret', body, sign('other', body)), false);
  assert.strictEqual(verifySignature('secret', `${body} `, sign('secret', body)), false);
  assert.strictEqual(verifySignature('secret', body, undefined), false);
  assert.strictEqual(verifySignature('secret', body, 'sha1=abc'), false);
  assert.strictEqual(verifySignature('', body, sign('', body)), false);
});

test('only a push to the deploy branch triggers a deploy', () => {
  const push = { ref: 'refs/heads/main', after: sha('a') };
  assert.strictEqual(pushedCommit('push', push, 'main'), sha('a'));
  assert.strictEqual(pushedCommit('push', { ...push, ref: 'refs/heads/feature' }, 'main'), null);
  assert.strictEqual(pushedCommit('push', { ...push, ref: 'refs/tags/main' }, 'main'), null);
  assert.strictEqual(pushedCommit('push', { ...push, deleted: true }, 'main'), null);
  assert.strictEqual(pushedCommit('ping', push, 'main'), null);
  assert.strictEqual(pushedCommit('push', { ...push, after: 'not-a-sha' }, 'main'), null);
});

test('pruning keeps the newest releases and never the live or new one', () => {
  const releases = ['a', 'b', 'c', 'd', 'e'].map((char, index) => ({ name: sha(char), mtimeMs: index }));
  // e is newest, a is oldest and live.
  const pruned = releasesToPrune([...releases, { name: 'current', mtimeMs: 99 }], [sha('a'), sha('e')], 3);
  assert.deepStrictEqual(pruned.sort(), [sha('b'), sha('c')]);
});

test('the forwarded client address from the reverse proxy is kept', () => {
  const kept = upstreamHeaders({ 'x-forwarded-for': '203.0.113.7', host: 'f1.example' }, '10.0.0.2');
  assert.strictEqual(kept.get('x-forwarded-for'), '203.0.113.7');
  assert.strictEqual(kept.get('host'), 'f1.example');

  const direct = upstreamHeaders({}, '198.51.100.4');
  assert.strictEqual(direct.get('x-forwarded-for'), '198.51.100.4');
  assert.strictEqual(direct.get('x-forwarded-proto'), 'http');
});
