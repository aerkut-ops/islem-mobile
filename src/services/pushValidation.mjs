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

export function isExpectedExpoProject(value) {
  return String(value || '') === EXPO_PROJECT_ID;
}

export function normalizePushRegistrationResult(value) {
  return value === true;
}
