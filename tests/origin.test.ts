import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../src/lib/request-origin';

test('accepts matching browser host despite Next internal localhost URL', () => {
  const request = new Request('http://localhost:3000/api/auth', {
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
  });
  assert.equal(isSameOrigin(request), true);
});
test('rejects foreign, missing and opaque origins and protocol changes', () => {
  for (const origin of [
    'https://attacker.example',
    'null',
    'http://127.0.0.1:3001',
    'https://127.0.0.1:3000',
    'http://127.0.0.1:3000/path',
  ]) {
    assert.equal(
      isSameOrigin(
        new Request('http://localhost:3000/api/auth', {
          headers: { host: '127.0.0.1:3000', origin },
        }),
      ),
      false,
    );
  }
  assert.equal(isSameOrigin(new Request('http://localhost:3000/api/auth')), false);
});
test('accepts standard HTTPS production requests', () => {
  assert.equal(
    isSameOrigin(
      new Request('https://health.example/api/auth', {
        headers: { host: 'health.example', origin: 'https://health.example' },
      }),
    ),
    true,
  );
});
