import assert from 'node:assert/strict';
import test from 'node:test';
import { authOrigin } from '../src/lib/auth-origin';

test('OAuth uses only a configured HTTP(S) origin', () => {
  assert.equal(authOrigin('https://health.example/'), 'https://health.example');
  assert.equal(authOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  for (const value of [
    undefined,
    '',
    '/login',
    'javascript:alert(1)',
    'https://user:password@health.example',
    'https://health.example/other',
    'https://health.example/?next=https://other.example',
    'https://health.example/#callback',
  ])
    assert.equal(authOrigin(value), null);
});
