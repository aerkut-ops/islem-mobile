export const EXPO_PROJECT_ID = '0c09f907-48f9-405c-bc54-877f165297a3';

const EXPO_PUSH_TOKEN_PATTERN =
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function normalizePushLocale(value) {
  return String(value || '').toLowerCase() === 'tr' ? 'tr' : 'en';
}

export function normalizeExpoPushToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (
    token.length < 20 ||
    token.length > 255 ||
    !EXPO_PUSH_TOKEN_PATTERN.test(token)
  ) {
    return '';
  }
  return token;
}

export function normalizeDevicePushToken(value, platform) {
  const type = String(value?.type || '').trim().toLowerCase();
  const data = typeof value?.data === 'string' ? value.data.trim() : '';
  if (
    !['ios', 'android'].includes(type) ||
    type !== platform ||
    !/^\S{16,4096}$/.test(data)
  ) {
    return null;
  }
  return { data, type };
}

export function isExpectedExpoProject(value) {
  return String(value || '') === EXPO_PROJECT_ID;
}

export function normalizePushRegistrationResult(value) {
  return value === true;
}
