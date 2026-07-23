import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';
const TURNSTILE_URL =
  process.env.EXPO_PUBLIC_TURNSTILE_URL ||
  'https://aerkut-ops.github.io/islem-mobile/turnstile.html';
const TURNSTILE_ALWAYS_PASS_TEST_KEY = '1x00000000000000000000AA';
const TURNSTILE_ALWAYS_PASS_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

export const isTurnstileConfigured = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_URL);
export const getTurnstileDevelopmentToken = () =>
  __DEV__ && TURNSTILE_SITE_KEY === TURNSTILE_ALWAYS_PASS_TEST_KEY
    ? TURNSTILE_ALWAYS_PASS_TEST_TOKEN
    : null;

export default function TurnstileChallenge({
  language,
  onCancel,
  onError,
  onToken,
  strings,
  visible,
}) {
  const handledToken = useRef(false);
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const challengeUrl = useMemo(() => {
    const query = new URLSearchParams({
      lang: language === 'tr' ? 'tr' : 'en',
      sitekey: TURNSTILE_SITE_KEY,
      v: '20260724-2',
    });
    return `${TURNSTILE_URL}?${query.toString()}`;
  }, [language]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    handledToken.current = false;
    setLoading(true);
    const timeout = setTimeout(() => {
      if (handledToken.current) {
        return;
      }
      handledToken.current = true;
      onErrorRef.current('native-timeout');
    }, 20000);

    return () => clearTimeout(timeout);
  }, [visible]);

  if (!visible) {
    return null;
  }

  const failChallenge = () => {
    if (handledToken.current) {
      return;
    }
    handledToken.current = true;
    onErrorRef.current();
  };

  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'turnstile-ready') {
        setLoading(false);
        return;
      }
      if (
        message.type === 'turnstile-token' &&
        message.token &&
        !handledToken.current
      ) {
        handledToken.current = true;
        onToken(message.token);
        return;
      }
      if (message.type === 'turnstile-error') {
        if (handledToken.current) {
          return;
        }
        handledToken.current = true;
        onErrorRef.current(message.code);
      }
    } catch {
      failChallenge();
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{strings.eyebrow}</Text>
              <Text style={styles.title}>{strings.title}</Text>
            </View>
            <Pressable
              accessibilityLabel={strings.cancel}
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>{strings.help}</Text>
          <View style={styles.webViewFrame}>
            <WebView
              allowsInlineMediaPlayback
              cacheEnabled={false}
              domStorageEnabled
              javaScriptEnabled
              mediaPlaybackRequiresUserAction={false}
              onError={failChallenge}
              onHttpError={failChallenge}
              onLoadEnd={() => setLoading(false)}
              onLoadStart={() => setLoading(true)}
              onMessage={handleMessage}
              originWhitelist={['https://*', 'about:blank', 'about:srcdoc']}
              setSupportMultipleWindows={false}
              source={{ uri: challengeUrl }}
              style={styles.webView}
            />
            {loading ? (
              <View pointerEvents="none" style={styles.loading}>
                <ActivityIndicator color="#1fa7a0" />
                <Text style={styles.loadingText}>{strings.loading}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelText}>{strings.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 400,
    padding: 16,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleCopy: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#20242a',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
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
  help: {
    color: '#68737d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 12,
  },
  webViewFrame: {
    backgroundColor: '#ffffff',
    height: 120,
    marginTop: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  webView: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    bottom: 0,
    gap: 8,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingText: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '800',
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
});
