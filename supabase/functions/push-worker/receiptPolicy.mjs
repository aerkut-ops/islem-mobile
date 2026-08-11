export function shouldDisablePushDevice(errorCode, message) {
  return (
    errorCode === 'DeviceNotRegistered' ||
    (
      errorCode === 'DeveloperError' &&
      String(message || '').includes('BadDeviceToken')
    )
  );
}
