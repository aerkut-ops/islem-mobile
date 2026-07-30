import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  EXPO_PROJECT_ID,
  isExpectedExpoProject,
  normalizeExpoPushToken,
  normalizePushLocale,
  normalizePushRegistrationResult,
} from './pushValidation.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const PUSH_ENABLED_KEY = 'islem-push-enabled-v1';
const PUSH_TOKEN_KEY = 'islem-expo-push-token-v1';
const PUSH_CHANNEL_ID = 'social';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getPushPreference() {
  return (await AsyncStorage.getItem(PUSH_ENABLED_KEY)) === 'true';
}

export async function getPushPermissionState() {
  if (!isPushPlatformSupported()) {
    return 'unavailable';
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === 'granted') {
    return 'granted';
  }
  return permission.canAskAgain === false ? 'denied' : 'undetermined';
}

export async function enablePushNotifications(locale) {
  requirePushService();
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
  await ensureAndroidChannel();

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }
  if (permission.status !== 'granted') {
    return {
      status: permission.canAskAgain === false ? 'denied' : 'disabled',
    };
  }

  return registerCurrentPushDevice(locale);
}

export async function syncPushRegistration(locale) {
  if (!isPushPlatformSupported() || !isSupabaseConfigured || !supabase) {
    return { status: 'unavailable' };
  }
  if (!(await getPushPreference())) {
    return { status: 'disabled' };
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    await detachStoredPushToken();
    return {
      status: permission.canAskAgain === false ? 'denied' : 'disabled',
    };
  }

  await ensureAndroidChannel();
  return registerCurrentPushDevice(locale);
}

export async function disablePushNotifications() {
  requirePushService();
  await detachStoredPushToken();
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
  await Notifications.setBadgeCountAsync(0).catch(() => false);
  return { status: 'disabled' };
}

export async function detachPushTokenBeforeSignOut() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }
  await detachStoredPushToken();
}

export function subscribeToPushTokenChanges(listener) {
  if (!isPushPlatformSupported()) {
    return () => {};
  }
  const subscription = Notifications.addPushTokenListener(() => listener());
  return () => subscription.remove();
}

export function subscribeToNotificationEvents({
  onNotification,
  onResponse,
}) {
  if (!isPushPlatformSupported()) {
    return () => {};
  }

  const notificationSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      onNotification?.(notification);
    });
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      onResponse?.(response);
    });

  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse?.notification) {
    onResponse?.(lastResponse);
    Notifications.clearLastNotificationResponse();
  }

  return () => {
    notificationSubscription.remove();
    responseSubscription.remove();
  };
}

async function registerCurrentPushDevice(locale) {
  const projectId = getExpoProjectId();
  if (!isExpectedExpoProject(projectId)) {
    throw makePushError('invalid_push_project');
  }

  const token = normalizeExpoPushToken(
    (
      await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      })
    ).data,
  );
  if (!token) {
    throw makePushError('invalid_expo_push_token');
  }

  const { data, error } = await supabase.rpc('register_push_device', {
    p_application_id: getApplicationId(),
    p_expo_push_token: token,
    p_locale: normalizePushLocale(locale),
    p_platform: Platform.OS,
    p_project_id: EXPO_PROJECT_ID,
  });
  if (error) {
    throw error;
  }
  if (!normalizePushRegistrationResult(data)) {
    throw makePushError('push_token_in_use');
  }

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return { status: 'enabled' };
}

async function detachStoredPushToken() {
  const token = normalizeExpoPushToken(
    await AsyncStorage.getItem(PUSH_TOKEN_KEY),
  );
  if (!token) {
    return;
  }

  const { error } = await supabase.rpc('unregister_push_device', {
    p_expo_push_token: token,
  });
  if (error) {
    throw error;
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Arkadaş bildirimleri',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#1FA7A0',
    sound: 'default',
    vibrationPattern: [0, 200, 120, 200],
  });
}

function getExpoProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    ''
  );
}

function getApplicationId() {
  if (Platform.OS === 'ios') {
    return Constants?.expoConfig?.ios?.bundleIdentifier || null;
  }
  if (Platform.OS === 'android') {
    return Constants?.expoConfig?.android?.package || null;
  }
  return null;
}

function isPushPlatformSupported() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function requirePushService() {
  if (!isPushPlatformSupported() || !isSupabaseConfigured || !supabase) {
    throw makePushError('push_unavailable');
  }
}

function makePushError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
