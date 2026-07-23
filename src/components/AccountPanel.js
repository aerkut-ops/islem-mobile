import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { deleteCurrentAccount } from '../services/accountService';
import { sendMagicLink, signInWithPassword, signOut } from '../services/authService';
import { loadPlayerCloudStats } from '../services/playerCloudData';

const PRIVACY_POLICY_URL = 'https://aerkut-ops.github.io/islem-mobile/privacy.html';

export default function AccountPanel({ configured, loading, onClose, session, strings, visible }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState('link');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [cloudStats, setCloudStats] = useState(null);
  const [cloudStatsError, setCloudStatsError] = useState('');
  const [cloudStatsLoading, setCloudStatsLoading] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      setMessage('');
      setErrorMessage('');
      setDeleteConfirmVisible(false);
      setPassword('');
      setLoginMethod('link');
    }
  }, [visible]);

  useEffect(() => {
    let active = true;
    const userId = session?.user?.id;

    if (!visible || !userId) {
      setCloudStats(null);
      setCloudStatsError('');
      setCloudStatsLoading(false);
      return () => {
        active = false;
      };
    }

    setCloudStatsLoading(true);
    setCloudStatsError('');
    loadPlayerCloudStats(userId)
      .then((stats) => {
        if (active) {
          setCloudStats(stats);
        }
      })
      .catch(() => {
        if (active) {
          setCloudStatsError(strings.statsError);
        }
      })
      .finally(() => {
        if (active) {
          setCloudStatsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id, strings.statsError, visible]);

  if (!visible) {
    return null;
  }

  const submitEmail = async () => {
    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMessage(strings.invalidEmail);
      return;
    }

    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await sendMagicLink(normalizedEmail);
      setMessage(strings.linkSent);
    } catch (error) {
      const rateLimited =
        error?.code === 'over_email_send_rate_limit' ||
        error?.status === 429 ||
        /rate limit/i.test(error?.message || '');
      setErrorMessage(rateLimited ? strings.emailRateLimit : error?.message || strings.genericError);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMessage(strings.invalidEmail);
      return;
    }
    if (!password) {
      setErrorMessage(strings.passwordRequired);
      return;
    }

    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await signInWithPassword(normalizedEmail, password);
      onClose();
    } catch (error) {
      const invalidCredentials =
        error?.code === 'invalid_credentials' ||
        /invalid login credentials/i.test(error?.message || '');
      setErrorMessage(invalidCredentials ? strings.invalidCredentials : strings.genericError);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await signOut();
      onClose();
    } catch (error) {
      setErrorMessage(error?.message || strings.genericError);
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await deleteCurrentAccount();
      onClose();
    } catch {
      setErrorMessage(strings.deleteError);
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={styles.keyboardArea}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{strings.eyebrow}</Text>
              <Text style={styles.title}>{strings.title}</Text>
            </View>
            <Pressable
              accessibilityLabel={strings.close}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color="#1fa7a0" />
                <Text style={styles.helperText}>{strings.loading}</Text>
              </View>
            ) : session ? (
              <View>
                <View style={styles.profileMark}>
                  <Text style={styles.profileMarkText}>
                    {(session.user.email || '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.centerTitle}>{strings.signedIn}</Text>
                <Text numberOfLines={1} style={styles.accountEmail}>{session.user.email}</Text>
                <View style={styles.cloudRow}>
                  <Text style={styles.cloudIcon}>✓</Text>
                  <View style={styles.cloudCopy}>
                    <Text style={styles.cloudTitle}>{strings.cloudReady}</Text>
                    <Text style={styles.helperText}>{strings.cloudText}</Text>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>{strings.cloudStats}</Text>
                {cloudStatsLoading ? (
                  <View style={styles.statsLoadingState}>
                    <ActivityIndicator color="#1fa7a0" size="small" />
                    <Text style={styles.helperText}>{strings.statsLoading}</Text>
                  </View>
                ) : cloudStats ? (
                  <View style={styles.statsGrid}>
                    <CloudStat label={strings.totalScore} value={cloudStats.total_score} />
                    <CloudStat label={strings.completedGames} value={cloudStats.games_completed} />
                    <CloudStat label={strings.solvedTargets} value={cloudStats.targets_solved} />
                    <CloudStat label={strings.currentStreak} value={cloudStats.current_streak} />
                  </View>
                ) : null}
                {cloudStatsError ? <Text style={styles.errorText}>{cloudStatsError}</Text> : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={handleSignOut}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {busy ? <ActivityIndicator color="#20242a" /> : <Text style={styles.secondaryText}>{strings.signOut}</Text>}
                </Pressable>
                <View style={styles.dangerSection}>
                  <Text style={styles.dangerTitle}>{strings.deleteTitle}</Text>
                  <Text style={styles.helperText}>{strings.deleteText}</Text>
                  {deleteConfirmVisible ? (
                    <View>
                      <Text style={styles.confirmText}>{strings.deleteConfirmText}</Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => setDeleteConfirmVisible(false)}
                          style={({ pressed }) => [
                            styles.cancelButton,
                            busy && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.cancelText}>{strings.cancel}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={handleDeleteAccount}
                          style={({ pressed }) => [
                            styles.deleteButton,
                            busy && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          {busy ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text style={styles.deleteButtonText}>{strings.deleteForever}</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setDeleteConfirmVisible(true)}
                      style={({ pressed }) => [
                        styles.deleteOutlineButton,
                        busy && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.deleteOutlineText}>{strings.deleteAccount}</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  accessibilityLabel={strings.privacyPolicyA11y}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.privacyLink}>{strings.privacyPolicy}</Text>
                </Pressable>
              </View>
            ) : !configured ? (
              <View style={styles.infoState}>
                <Text style={styles.centerTitle}>{strings.unavailableTitle}</Text>
                <Text style={styles.centerText}>{strings.unavailableText}</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.centerTitle}>{strings.guestTitle}</Text>
                <Text style={styles.centerText}>{strings.guestText}</Text>
                <View style={styles.loginMethodRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setLoginMethod('link');
                      setErrorMessage('');
                      setMessage('');
                    }}
                    style={({ pressed }) => [
                      styles.loginMethodButton,
                      loginMethod === 'link' && styles.loginMethodButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.loginMethodText,
                        loginMethod === 'link' && styles.loginMethodTextActive,
                      ]}
                    >
                      {strings.magicLinkMethod}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setLoginMethod('password');
                      setErrorMessage('');
                      setMessage('');
                    }}
                    style={({ pressed }) => [
                      styles.loginMethodButton,
                      loginMethod === 'password' && styles.loginMethodButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.loginMethodText,
                        loginMethod === 'password' && styles.loginMethodTextActive,
                      ]}
                    >
                      {strings.passwordMethod}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.inputLabel}>{strings.emailLabel}</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!busy}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onSubmitEditing={loginMethod === 'password' ? undefined : submitEmail}
                  placeholder={strings.emailPlaceholder}
                  placeholderTextColor="#8a949d"
                  returnKeyType="go"
                  style={styles.input}
                  value={email}
                />
                {loginMethod === 'password' ? (
                  <>
                    <Text style={styles.passwordLabel}>{strings.passwordLabel}</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="current-password"
                      autoCorrect={false}
                      editable={!busy}
                      onChangeText={setPassword}
                      onSubmitEditing={submitPassword}
                      placeholder={strings.passwordPlaceholder}
                      placeholderTextColor="#8a949d"
                      returnKeyType="go"
                      secureTextEntry
                      style={styles.input}
                      textContentType="password"
                      value={password}
                    />
                    <Text style={styles.helperText}>{strings.passwordHelp}</Text>
                  </>
                ) : (
                  <Text style={styles.helperText}>{strings.magicLinkHelp}</Text>
                )}
                {message ? <Text style={styles.successText}>{message}</Text> : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={loginMethod === 'password' ? submitPassword : submitEmail}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryText}>
                      {loginMethod === 'password' ? strings.passwordContinue : strings.continue}
                    </Text>
                  )}
                </Pressable>
                <Text style={styles.privacyText}>{strings.privacy}</Text>
                <Pressable
                  accessibilityLabel={strings.privacyPolicyA11y}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.privacyLink}>{strings.privacyPolicy}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CloudStat({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text numberOfLines={1} style={styles.statValue}>{String(value ?? 0)}</Text>
      <Text numberOfLines={2} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.42)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 70,
  },
  keyboardArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
    maxWidth: 480,
    padding: 16,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  eyebrow: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#20242a',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 1,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeText: {
    color: '#20242a',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  loadingState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 48,
  },
  infoState: {
    paddingBottom: 18,
    paddingTop: 12,
  },
  centerTitle: {
    color: '#20242a',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerText: {
    color: '#68737d',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  inputLabel: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    marginTop: 22,
  },
  passwordLabel: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    marginTop: 12,
  },
  loginMethodRow: {
    backgroundColor: '#f0f3f5',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    marginTop: 18,
    padding: 4,
  },
  loginMethodButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  loginMethodButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderWidth: StyleSheet.hairlineWidth,
  },
  loginMethodText: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  loginMethodTextActive: {
    color: '#147b76',
  },
  input: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#20242a',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  helperText: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 7,
  },
  successText: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 10,
  },
  errorText: {
    color: '#a23f3f',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  privacyText: {
    color: '#8a949d',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  privacyLink: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  profileMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#d9f5f2',
    borderRadius: 31,
    height: 62,
    justifyContent: 'center',
    marginBottom: 12,
    width: 62,
  },
  profileMarkText: {
    color: '#147b76',
    fontSize: 27,
    fontWeight: '900',
  },
  accountEmail: {
    color: '#68737d',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },
  cloudRow: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: 20,
    padding: 12,
  },
  cloudIcon: {
    color: '#147b76',
    fontSize: 20,
    fontWeight: '900',
    marginRight: 10,
  },
  cloudCopy: {
    flex: 1,
  },
  cloudTitle: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  sectionLabel: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 18,
    textTransform: 'uppercase',
  },
  statsLoadingState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 76,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  statCard: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 72,
    padding: 10,
  },
  statValue: {
    color: '#147b76',
    fontSize: 20,
    fontWeight: '900',
  },
  statLabel: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    marginTop: 2,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 46,
  },
  secondaryText: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  dangerSection: {
    borderTopColor: '#e6d4d4',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
    paddingTop: 16,
  },
  dangerTitle: {
    color: '#8f3636',
    fontSize: 13,
    fontWeight: '900',
  },
  deleteOutlineButton: {
    alignItems: 'center',
    borderColor: '#c86a6a',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  deleteOutlineText: {
    color: '#8f3636',
    fontSize: 12,
    fontWeight: '900',
  },
  confirmText: {
    color: '#8f3636',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 10,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#a23f3f',
    borderRadius: 8,
    flex: 1.35,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
