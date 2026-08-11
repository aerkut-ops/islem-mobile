import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeModerationLimit,
  normalizeModeratorRole,
  normalizePlayerReportActions,
  normalizePlayerReports,
  normalizeReportStatus,
  validateModerationDecision,
} from '../src/services/moderationValidation.mjs';

const REPORT_ID = '123e4567-e89b-42d3-a456-426614174000';
const PLAYER_ID = '123e4567-e89b-42d3-a456-426614174001';

test('moderator roles, report status, and limits are bounded', () => {
  assert.equal(normalizeModeratorRole(' OWNER '), 'owner');
  assert.equal(normalizeModeratorRole('admin'), null);
  assert.equal(normalizeReportStatus('REVIEWING'), 'reviewing');
  assert.equal(normalizeReportStatus('unknown'), 'pending');
  assert.equal(normalizeModerationLimit(0), 1);
  assert.equal(normalizeModerationLimit(500), 100);
  assert.equal(normalizeModerationLimit('bad'), 50);
});

test('player reports keep only safe validated fields', () => {
  assert.deepEqual(
    normalizePlayerReports([
      {
        created_at: '2026-08-10T12:00:00.000Z',
        display_name_snapshot: '  Player One  ',
        email: 'hidden@example.com',
        reason: 'HARASSMENT',
        related_open_reports: '2',
        report_id: REPORT_ID,
        reported_player_id: PLAYER_ID,
        resolution: null,
        reviewed_at: null,
        status: 'PENDING',
        username_snapshot: 'player_one',
      },
    ]),
    [
      {
        created_at: '2026-08-10T12:00:00.000Z',
        display_name_snapshot: 'Player One',
        reason: 'harassment',
        related_open_reports: 2,
        report_id: REPORT_ID,
        reported_player_id: PLAYER_ID,
        resolution: null,
        reviewed_at: null,
        status: 'pending',
        username_snapshot: 'player_one',
      },
    ],
  );
});

test('malformed report and history rows are discarded', () => {
  assert.deepEqual(
    normalizePlayerReports([
      {
        created_at: 'invalid',
        reason: 'other',
        report_id: REPORT_ID,
        reported_player_id: PLAYER_ID,
        status: 'pending',
        username_snapshot: 'player_one',
      },
    ]),
    [],
  );

  assert.deepEqual(
    normalizePlayerReportActions([
      {
        action: 'review',
        action_id: '1',
        created_at: '2026-08-10T12:01:00.000Z',
        moderator_role: 'owner',
        next_status: 'reviewing',
        previous_status: 'pending',
        resolution: null,
      },
      {
        action: 'delete',
        action_id: 2,
        created_at: '2026-08-10T12:02:00.000Z',
        moderator_role: 'owner',
        next_status: 'resolved',
        previous_status: 'reviewing',
      },
    ]),
    [
      {
        action: 'review',
        action_id: 1,
        created_at: '2026-08-10T12:01:00.000Z',
        moderator_role: 'owner',
        next_status: 'reviewing',
        previous_status: 'pending',
        resolution: null,
      },
    ],
  );
});

test('moderation decisions allow only server-supported transitions', () => {
  assert.deepEqual(validateModerationDecision('review'), {
    action: 'review',
    error: null,
    resolution: null,
  });
  assert.deepEqual(validateModerationDecision('resolve', 'profile_cleared'), {
    action: 'resolve',
    error: null,
    resolution: 'profile_cleared',
  });
  assert.equal(
    validateModerationDecision('dismiss', 'profile_cleared').error,
    'invalid_moderation_decision',
  );
  assert.equal(
    validateModerationDecision('resolve').error,
    'invalid_moderation_decision',
  );
});
