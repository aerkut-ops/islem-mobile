import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDisplayName,
  normalizeUsername,
  validateProfileInput,
} from '../src/services/profileValidation.mjs';

test('profile values are trimmed and usernames are lowercased', () => {
  assert.equal(normalizeUsername('  Aydin_94  '), 'aydin_94');
  assert.equal(normalizeDisplayName('  Aydın Erkut  '), 'Aydın Erkut');
});

test('valid username and display name return normalized values', () => {
  assert.deepEqual(
    validateProfileInput({
      displayName: '  Aydın Erkut ',
      username: ' Aydin_94 ',
    }),
    {
      displayName: 'Aydın Erkut',
      error: null,
      username: 'aydin_94',
    },
  );
});

test('username rejects short, long, spaced, and non-ascii values', () => {
  for (const username of [
    'ab',
    'a'.repeat(25),
    'two words',
    'aydın',
    'name-with-dash',
  ]) {
    assert.equal(
      validateProfileInput({ displayName: '', username }).error,
      'invalid_username',
    );
  }
});

test('display name is optional but cannot exceed forty characters', () => {
  assert.equal(
    validateProfileInput({ displayName: '', username: 'player_1' }).error,
    null,
  );
  assert.equal(
    validateProfileInput({
      displayName: 'A'.repeat(41),
      username: 'player_1',
    }).error,
    'invalid_display_name',
  );
});
