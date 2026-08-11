import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
  normalizeModerationLimit,
  normalizeModeratorRole,
  normalizePlayerReportActions,
  normalizePlayerReports,
  normalizeReportStatus,
  validateModerationDecision,
} from './moderationValidation.mjs';

export async function loadModeratorAccess() {
  requireModerationService();
  const { data, error } = await supabase.rpc('get_report_moderator_access');
  if (error) {
    throw error;
  }
  return normalizeModeratorRole(data);
}

export async function loadPlayerReports(status = 'pending', limit = 50) {
  requireModerationService();
  const { data, error } = await supabase.rpc('list_player_reports', {
    p_limit: normalizeModerationLimit(limit),
    p_status: normalizeReportStatus(status),
  });
  if (error) {
    throw error;
  }
  return normalizePlayerReports(data);
}

export async function loadPlayerReportActions(reportId) {
  requireModerationService(reportId);
  const { data, error } = await supabase.rpc('list_player_report_actions', {
    p_report_id: reportId,
  });
  if (error) {
    throw error;
  }
  return normalizePlayerReportActions(data);
}

export async function moderatePlayerReport({ action, reportId, resolution }) {
  requireModerationService(reportId);
  const decision = validateModerationDecision(action, resolution);
  if (decision.error) {
    throw makeModerationError(decision.error);
  }

  const { data, error } = await supabase.rpc('moderate_player_report', {
    p_action: decision.action,
    p_report_id: reportId,
    p_resolution: decision.resolution,
  });
  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const expectedStatus = {
    dismiss: 'dismissed',
    resolve: 'resolved',
    review: 'reviewing',
  }[decision.action];
  if (
    result?.report_id !== reportId ||
    result.status !== expectedStatus ||
    (decision.resolution && result.resolution !== decision.resolution)
  ) {
    throw makeModerationError('invalid_moderation_response');
  }
  return result;
}

function requireModerationService(value = true) {
  if (!isSupabaseConfigured || !supabase || !value) {
    throw makeModerationError('moderation_unavailable');
  }
}

function makeModerationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
