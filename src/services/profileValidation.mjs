export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeDisplayName(value) {
  return String(value || '').trim();
}

export function validateProfileInput({ username, displayName }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedDisplayName = normalizeDisplayName(displayName);

  if (
    normalizedUsername.length < USERNAME_MIN_LENGTH ||
    normalizedUsername.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(normalizedUsername)
  ) {
    return {
      error: 'invalid_username',
      displayName: normalizedDisplayName,
      username: normalizedUsername,
    };
  }

  if (normalizedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      error: 'invalid_display_name',
      displayName: normalizedDisplayName,
      username: normalizedUsername,
    };
  }

  return {
    error: null,
    displayName: normalizedDisplayName,
    username: normalizedUsername,
  };
}
