import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  cancelFriendRequest,
  loadFriendConnections,
  removeFriend,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
} from '../services/friendService';

const EMPTY_CONNECTIONS = {
  friends: [],
  incoming: [],
  outgoing: [],
};

export default function FriendsPanel({
  configured,
  loading,
  onClose,
  onOpenAccount,
  profile,
  session,
  strings,
  visible,
}) {
  const [connections, setConnections] = useState(EMPTY_CONNECTIONS);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [actionKey, setActionKey] = useState('');

  const canLoadFriends = Boolean(
    configured && session?.user?.id && profile?.username,
  );

  const refreshConnections = useCallback(async () => {
    if (!canLoadFriends) {
      return;
    }

    setConnectionsLoading(true);
    setErrorMessage('');
    try {
      setConnections(await loadFriendConnections());
    } catch {
      setErrorMessage(strings.loadError);
    } finally {
      setConnectionsLoading(false);
    }
  }, [canLoadFriends, strings.loadError]);

  useEffect(() => {
    if (!visible) {
      setConnections(EMPTY_CONNECTIONS);
      setConnectionsLoading(false);
      setErrorMessage('');
      setSearchText('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchComplete(false);
      setActionKey('');
      return;
    }

    if (canLoadFriends) {
      refreshConnections();
    }
  }, [canLoadFriends, refreshConnections, visible]);

  const handleSearch = async () => {
    const query = searchText.trim();
    setSearchLoading(true);
    setSearchComplete(false);
    setErrorMessage('');
    try {
      const results = await searchPlayers(query);
      setSearchResults(results);
      setSearchComplete(true);
    } catch (error) {
      setSearchResults([]);
      setErrorMessage(
        error?.code === 'invalid_search' ||
          String(error?.message || '').includes('invalid_search')
          ? strings.invalidSearch
          : strings.searchError,
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const refreshAfterAction = async () => {
    const query = searchText.trim();
    const tasks = [loadFriendConnections()];
    if (query.length >= 2) {
      tasks.push(searchPlayers(query));
    }

    const [nextConnections, nextSearchResults] = await Promise.all(tasks);
    setConnections(nextConnections);
    if (nextSearchResults) {
      setSearchResults(nextSearchResults);
    }
  };

  const runAction = async (key, action) => {
    setActionKey(key);
    setErrorMessage('');
    try {
      await action();
      await refreshAfterAction();
    } catch {
      setErrorMessage(strings.actionError);
    } finally {
      setActionKey('');
    }
  };

  const confirmRemove = (player) => {
    const name = player.display_name || `@${player.username}`;
    Alert.alert(
      strings.removeTitle,
      strings.removeMessage(name),
      [
        { style: 'cancel', text: strings.cancel },
        {
          onPress: () =>
            runAction(`remove-${player.player_id}`, () =>
              removeFriend(player.player_id),
            ),
          style: 'destructive',
          text: strings.remove,
        },
      ],
    );
  };

  if (!visible) {
    return null;
  }

  let content;
  if (loading) {
    content = <PanelState loading text={strings.loadingAccount} />;
  } else if (!configured) {
    content = (
      <PanelState
        actionLabel={strings.closeAction}
        onAction={onClose}
        text={strings.unavailableText}
        title={strings.unavailableTitle}
      />
    );
  } else if (!session) {
    content = (
      <PanelState
        actionLabel={strings.signIn}
        onAction={onOpenAccount}
        text={strings.accountRequiredText}
        title={strings.accountRequiredTitle}
      />
    );
  } else if (!profile?.username) {
    content = (
      <PanelState
        actionLabel={strings.openProfile}
        onAction={onOpenAccount}
        text={strings.profileRequiredText}
        title={strings.profileRequiredTitle}
      />
    );
  } else {
    content = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.inputLabel}>{strings.searchLabel}</Text>
        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!searchLoading && !actionKey}
            maxLength={40}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            placeholder={strings.searchPlaceholder}
            placeholderTextColor="#8a949d"
            returnKeyType="search"
            style={styles.input}
            value={searchText}
          />
          <Pressable
            accessibilityRole="button"
            disabled={searchLoading || Boolean(actionKey)}
            onPress={handleSearch}
            style={({ pressed }) => [
              styles.searchButton,
              (searchLoading || actionKey) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {searchLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>{strings.search}</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.helperText}>{strings.searchHint}</Text>

        {errorMessage ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            {errorMessage === strings.loadError ? (
              <Pressable
                accessibilityRole="button"
                onPress={refreshConnections}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.retryText}>{strings.retry}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {searchComplete ? (
          <FriendSection
            emptyText={strings.emptySearch}
            rows={searchResults}
            strings={strings}
            title={strings.searchResults}
          >
            {(player) => (
              <SearchActions
                actionKey={actionKey}
                onAccept={() =>
                  runAction(`accept-${player.request_id}`, () =>
                    respondFriendRequest(player.request_id, true),
                  )
                }
                onAdd={() =>
                  runAction(`add-${player.player_id}`, () =>
                    sendFriendRequest(player.player_id),
                  )
                }
                onDecline={() =>
                  runAction(`decline-${player.request_id}`, () =>
                    respondFriendRequest(player.request_id, false),
                  )
                }
                onRemove={() => confirmRemove(player)}
                player={player}
                strings={strings}
              />
            )}
          </FriendSection>
        ) : null}

        {connectionsLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color="#1fa7a0" size="small" />
            <Text style={styles.helperText}>{strings.loading}</Text>
          </View>
        ) : (
          <>
            <FriendSection
              emptyText={strings.emptyIncoming}
              rows={connections.incoming}
              strings={strings}
              title={strings.incoming}
            >
              {(player) => (
                <View style={styles.actions}>
                  <SmallAction
                    busy={actionKey === `decline-${player.request_id}`}
                    disabled={Boolean(actionKey)}
                    label={strings.decline}
                    onPress={() =>
                      runAction(`decline-${player.request_id}`, () =>
                        respondFriendRequest(player.request_id, false),
                      )
                    }
                    secondary
                  />
                  <SmallAction
                    busy={actionKey === `accept-${player.request_id}`}
                    disabled={Boolean(actionKey)}
                    label={strings.accept}
                    onPress={() =>
                      runAction(`accept-${player.request_id}`, () =>
                        respondFriendRequest(player.request_id, true),
                      )
                    }
                  />
                </View>
              )}
            </FriendSection>

            <FriendSection
              emptyText={strings.emptyFriends}
              rows={connections.friends}
              strings={strings}
              title={strings.list}
            >
              {(player) => (
                <SmallAction
                  busy={actionKey === `remove-${player.player_id}`}
                  disabled={Boolean(actionKey)}
                  label={strings.remove}
                  onPress={() => confirmRemove(player)}
                  secondary
                />
              )}
            </FriendSection>

            {connections.outgoing.length > 0 ? (
              <FriendSection
                rows={connections.outgoing}
                strings={strings}
                title={strings.outgoing}
              >
                {(player) => (
                  <SmallAction
                    busy={actionKey === `cancel-${player.request_id}`}
                    disabled={Boolean(actionKey)}
                    label={strings.cancel}
                    onPress={() =>
                      runAction(`cancel-${player.request_id}`, () =>
                        cancelFriendRequest(player.request_id),
                      )
                    }
                    secondary
                  />
                )}
              </FriendSection>
            ) : null}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
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
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {content}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PanelState({
  actionLabel,
  loading = false,
  onAction,
  text,
  title,
}) {
  return (
    <View style={styles.panelState}>
      {loading ? <ActivityIndicator color="#1fa7a0" /> : null}
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      <Text style={styles.stateText}>{text}</Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FriendSection({ children, emptyText, rows, title }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}
        {rows.length > 0 ? ` · ${rows.length}` : ''}
      </Text>
      {rows.length > 0 ? (
        rows.map((player) => (
          <View key={`${title}-${player.player_id}`} style={styles.playerRow}>
            <View style={styles.playerMark}>
              <Text style={styles.playerMarkText}>
                {(player.display_name || player.username || '?')
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.playerCopy}>
              <Text numberOfLines={1} style={styles.playerName}>
                {player.display_name || `@${player.username}`}
              </Text>
              <Text numberOfLines={1} style={styles.username}>
                @{player.username}
              </Text>
            </View>
            {children(player)}
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>{emptyText}</Text>
      )}
    </View>
  );
}

function SearchActions({
  actionKey,
  onAccept,
  onAdd,
  onDecline,
  onRemove,
  player,
  strings,
}) {
  if (player.connection_type === 'friend') {
    return (
      <SmallAction
        busy={actionKey === `remove-${player.player_id}`}
        disabled={Boolean(actionKey)}
        label={strings.remove}
        onPress={onRemove}
        secondary
      />
    );
  }
  if (player.connection_type === 'incoming') {
    return (
      <View style={styles.actions}>
        <SmallAction
          busy={actionKey === `decline-${player.request_id}`}
          disabled={Boolean(actionKey)}
          label={strings.decline}
          onPress={onDecline}
          secondary
        />
        <SmallAction
          busy={actionKey === `accept-${player.request_id}`}
          disabled={Boolean(actionKey)}
          label={strings.accept}
          onPress={onAccept}
        />
      </View>
    );
  }
  if (player.connection_type === 'outgoing') {
    return <Text style={styles.sentText}>{strings.sent}</Text>;
  }
  return (
    <SmallAction
      busy={actionKey === `add-${player.player_id}`}
      disabled={Boolean(actionKey)}
      label={strings.add}
      onPress={onAdd}
    />
  );
}

function SmallAction({
  busy = false,
  disabled = false,
  label,
  onPress,
  secondary = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallAction,
        secondary && styles.smallActionSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={secondary ? '#147b76' : '#ffffff'}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.smallActionText,
            secondary && styles.smallActionSecondaryText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
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
    zIndex: 72,
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
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  inputLabel: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#20242a',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 12,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  helperText: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 6,
  },
  errorState: {
    backgroundColor: '#fff4f2',
    borderRadius: 8,
    marginTop: 10,
    padding: 10,
  },
  errorText: {
    color: '#b34b3f',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  retryText: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
  inlineLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 18,
  },
  section: {
    borderTopColor: '#edf2f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 11,
  },
  sectionTitle: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  playerRow: {
    alignItems: 'center',
    borderBottomColor: '#edf2f5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingVertical: 7,
  },
  playerMark: {
    alignItems: 'center',
    backgroundColor: '#d9f5f2',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  playerMarkText: {
    color: '#147b76',
    fontSize: 16,
    fontWeight: '900',
  },
  playerCopy: {
    flex: 1,
    marginHorizontal: 9,
    minWidth: 0,
  },
  playerName: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  username: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 5,
  },
  smallAction: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderColor: '#1fa7a0',
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 58,
    paddingHorizontal: 8,
  },
  smallActionSecondary: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd8de',
  },
  smallActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  smallActionSecondaryText: {
    color: '#147b76',
  },
  sentText: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
  },
  emptyText: {
    color: '#7d8790',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingVertical: 5,
  },
  panelState: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 44,
  },
  stateTitle: {
    color: '#20242a',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateText: {
    color: '#68737d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 44,
    minWidth: 160,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
});
