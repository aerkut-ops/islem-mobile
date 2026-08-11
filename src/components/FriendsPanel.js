import { useCallback, useEffect, useRef, useState } from 'react';
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
  blockPlayer,
  cancelFriendRequest,
  loadBlockedPlayers,
  loadFriendActivity,
  loadFriendConnections,
  loadFriendProfile,
  removeFriend,
  reportPlayer,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
  unblockPlayer,
} from '../services/friendService';
import { PLAYER_REPORT_REASONS } from '../services/friendValidation.mjs';
import {
  cancelChallengeInvite,
  loadActiveChallengeRoom,
  loadChallengeInvites,
  respondChallengeInvite,
  sendChallengeInvite,
} from '../services/challengeService';

const EMPTY_CONNECTIONS = {
  friends: [],
  incoming: [],
  outgoing: [],
};

const EMPTY_CHALLENGES = {
  incoming: [],
  outgoing: [],
};

export default function FriendsPanel({
  configured,
  loading,
  onChallengeReady,
  onClose,
  onIncomingCountChange,
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
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState('');
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendProfile, setFriendProfile] = useState(null);
  const [friendProfileLoading, setFriendProfileLoading] = useState(false);
  const [friendProfileError, setFriendProfileError] = useState('');
  const [challengeInvites, setChallengeInvites] = useState(EMPTY_CHALLENGES);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [blockedPlayers, setBlockedPlayers] = useState([]);
  const [blockedPlayersLoading, setBlockedPlayersLoading] = useState(false);
  const [reportingPlayer, setReportingPlayer] = useState(null);
  const friendProfileRequestRef = useRef(0);

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
      const nextConnections = await loadFriendConnections();
      setConnections(nextConnections);
      onIncomingCountChange?.(nextConnections.incoming.length);
    } catch {
      setErrorMessage(strings.loadError);
    } finally {
      setConnectionsLoading(false);
    }
  }, [canLoadFriends, onIncomingCountChange, strings.loadError]);

  const refreshActivity = useCallback(async () => {
    if (!canLoadFriends) {
      return;
    }

    setActivitiesLoading(true);
    setActivitiesError('');
    try {
      setActivities(await loadFriendActivity());
    } catch {
      setActivitiesError(strings.activityError);
    } finally {
      setActivitiesLoading(false);
    }
  }, [canLoadFriends, strings.activityError]);

  const refreshChallenges = useCallback(async () => {
    if (!canLoadFriends) {
      return;
    }

    setChallengesLoading(true);
    try {
      setChallengeInvites(await loadChallengeInvites());
    } catch {
      setErrorMessage(strings.challengeLoadError);
    } finally {
      setChallengesLoading(false);
    }
  }, [canLoadFriends, strings.challengeLoadError]);

  const refreshBlockedPlayers = useCallback(async () => {
    if (!canLoadFriends) {
      return;
    }

    setBlockedPlayersLoading(true);
    try {
      setBlockedPlayers(await loadBlockedPlayers());
    } catch {
      setErrorMessage(strings.blockedLoadError);
    } finally {
      setBlockedPlayersLoading(false);
    }
  }, [canLoadFriends, strings.blockedLoadError]);

  useEffect(() => {
    if (!visible) {
      friendProfileRequestRef.current += 1;
      setConnections(EMPTY_CONNECTIONS);
      setConnectionsLoading(false);
      setErrorMessage('');
      setSearchText('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchComplete(false);
      setActionKey('');
      setActivities([]);
      setActivitiesLoading(false);
      setActivitiesError('');
      setSelectedFriend(null);
      setFriendProfile(null);
      setFriendProfileLoading(false);
      setFriendProfileError('');
      setChallengeInvites(EMPTY_CHALLENGES);
      setChallengesLoading(false);
      setBlockedPlayers([]);
      setBlockedPlayersLoading(false);
      setReportingPlayer(null);
      return;
    }

    if (canLoadFriends) {
      refreshConnections();
      refreshActivity();
      refreshChallenges();
      refreshBlockedPlayers();
    }
  }, [
    canLoadFriends,
    refreshActivity,
    refreshBlockedPlayers,
    refreshChallenges,
    refreshConnections,
    visible,
  ]);

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
    const [
      nextConnections,
      nextChallenges,
      nextBlockedPlayers,
      nextSearchResults,
    ] =
      await Promise.all([
        loadFriendConnections(),
        loadChallengeInvites(),
        loadBlockedPlayers(),
        query.length >= 2 ? searchPlayers(query) : Promise.resolve(null),
      ]);
    setConnections(nextConnections);
    setChallengeInvites(nextChallenges);
    setBlockedPlayers(nextBlockedPlayers);
    onIncomingCountChange?.(nextConnections.incoming.length);
    if (nextSearchResults) {
      setSearchResults(nextSearchResults);
    }
    await refreshActivity();
  };

  const openFriendProfile = async (player) => {
    const requestId = friendProfileRequestRef.current + 1;
    friendProfileRequestRef.current = requestId;
    setSelectedFriend(player);
    setFriendProfile(null);
    setFriendProfileError('');
    setFriendProfileLoading(true);
    try {
      const nextProfile = await loadFriendProfile(player.player_id);
      if (friendProfileRequestRef.current === requestId) {
        setFriendProfile(nextProfile);
      }
    } catch {
      if (friendProfileRequestRef.current === requestId) {
        setFriendProfileError(strings.profileLoadError);
      }
    } finally {
      if (friendProfileRequestRef.current === requestId) {
        setFriendProfileLoading(false);
      }
    }
  };

  const closeFriendProfile = () => {
    friendProfileRequestRef.current += 1;
    setSelectedFriend(null);
    setFriendProfile(null);
    setFriendProfileLoading(false);
    setFriendProfileError('');
    setReportingPlayer(null);
  };

  const runAction = async (key, action) => {
    setActionKey(key);
    setErrorMessage('');
    try {
      const result = await action();
      await refreshAfterAction();
      return result;
    } catch {
      setErrorMessage(strings.actionError);
      return null;
    } finally {
      setActionKey('');
    }
  };

  const runChallengeAction = async (key, action) => {
    setActionKey(key);
    setErrorMessage('');
    try {
      const result = await action();
      await refreshAfterAction();
      return result;
    } catch {
      setErrorMessage(strings.challengeActionError);
      return null;
    } finally {
      setActionKey('');
    }
  };

  const acceptChallenge = async (invite) => {
    const response = await runChallengeAction(
      `challenge-accept-${invite.invite_id}`,
      () => respondChallengeInvite(invite.invite_id, true),
    );
    if (response?.result !== 'accepted') {
      return;
    }

    try {
      const room = await loadActiveChallengeRoom();
      if (room) {
        closeFriendProfile();
        onChallengeReady?.(room);
      }
    } catch {
      setErrorMessage(strings.challengeActionError);
    }
  };

  const declineChallenge = (invite) =>
    runChallengeAction(
      `challenge-decline-${invite.invite_id}`,
      () => respondChallengeInvite(invite.invite_id, false),
    );

  const cancelChallenge = (invite) =>
    runChallengeAction(
      `challenge-cancel-${invite.invite_id}`,
      () => cancelChallengeInvite(invite.invite_id),
    );

  const challengeForPlayer = (playerId, direction) =>
    challengeInvites[direction].find(
      (invite) => invite.player_id === playerId,
    ) || null;

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

  const confirmBlock = (player) => {
    const name = player.display_name || `@${player.username}`;
    Alert.alert(strings.blockTitle, strings.blockMessage(name), [
      { style: 'cancel', text: strings.cancel },
      {
        onPress: async () => {
          const result = await runAction(
            `block-${player.player_id}`,
            () => blockPlayer(player.player_id),
          );
          if (result === 'blocked') {
            closeFriendProfile();
          }
        },
        style: 'destructive',
        text: strings.block,
      },
    ]);
  };

  const submitPlayerReport = async (player, reason) => {
    const key = `report-${player.player_id}-${reason}`;
    setActionKey(key);
    try {
      const result = await reportPlayer(player.player_id, reason);
      setReportingPlayer(null);
      Alert.alert(
        strings.reportReceivedTitle,
        result === 'already_reported'
          ? strings.reportAlreadyReceived
          : strings.reportReceived,
      );
    } catch (error) {
      const rateLimited = String(error?.message || '').includes(
        'report_rate_limited',
      );
      Alert.alert(
        strings.reportErrorTitle,
        rateLimited ? strings.reportRateLimited : strings.reportError,
      );
    } finally {
      setActionKey('');
    }
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
                onReport={() => setReportingPlayer(player)}
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
                    disabled={Boolean(actionKey)}
                    label={strings.report}
                    onPress={() => setReportingPlayer(player)}
                    secondary
                  />
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
              onPlayerPress={openFriendProfile}
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

            {challengesLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color="#1fa7a0" size="small" />
                <Text style={styles.helperText}>
                  {strings.challengeLoading}
                </Text>
              </View>
            ) : (
              <>
                <FriendSection
                  emptyText={strings.emptyChallengeIncoming}
                  onPlayerPress={openFriendProfile}
                  rows={challengeInvites.incoming}
                  strings={strings}
                  title={strings.challengeIncoming}
                >
                  {(invite) => (
                    <View style={styles.actions}>
                      <SmallAction
                        busy={
                          actionKey ===
                          `challenge-decline-${invite.invite_id}`
                        }
                        disabled={Boolean(actionKey)}
                        label={strings.declineChallenge}
                        onPress={() => declineChallenge(invite)}
                        secondary
                      />
                      <SmallAction
                        busy={
                          actionKey ===
                          `challenge-accept-${invite.invite_id}`
                        }
                        disabled={Boolean(actionKey)}
                        label={strings.acceptChallenge}
                        onPress={() => acceptChallenge(invite)}
                      />
                    </View>
                  )}
                </FriendSection>

                {challengeInvites.outgoing.length > 0 ? (
                  <FriendSection
                    onPlayerPress={openFriendProfile}
                    rows={challengeInvites.outgoing}
                    strings={strings}
                    title={strings.challengeOutgoing}
                  >
                    {(invite) => (
                      <SmallAction
                        busy={
                          actionKey ===
                          `challenge-cancel-${invite.invite_id}`
                        }
                        disabled={Boolean(actionKey)}
                        label={strings.cancelChallenge}
                        onPress={() => cancelChallenge(invite)}
                        secondary
                      />
                    )}
                  </FriendSection>
                ) : null}
              </>
            )}

            {connections.outgoing.length > 0 ? (
              <FriendSection
                rows={connections.outgoing}
                strings={strings}
                title={strings.outgoing}
              >
                {(player) => (
                  <View style={styles.actions}>
                    <SmallAction
                      disabled={Boolean(actionKey)}
                      label={strings.report}
                      onPress={() => setReportingPlayer(player)}
                      secondary
                    />
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
                  </View>
                )}
              </FriendSection>
            ) : null}

            <ActivitySection
              activities={activities}
              error={activitiesError}
              loading={activitiesLoading}
              onPlayerPress={openFriendProfile}
              onRetry={refreshActivity}
              strings={strings}
            />

            {blockedPlayersLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color="#1fa7a0" size="small" />
                <Text style={styles.helperText}>
                  {strings.blockedLoading}
                </Text>
              </View>
            ) : (
              <FriendSection
                emptyText={strings.emptyBlocked}
                rows={blockedPlayers}
                strings={strings}
                title={strings.blockedTitle}
              >
                {(player) => (
                  <SmallAction
                    busy={actionKey === `unblock-${player.player_id}`}
                    disabled={Boolean(actionKey)}
                    label={strings.unblock}
                    onPress={() =>
                      runAction(`unblock-${player.player_id}`, () =>
                        unblockPlayer(player.player_id),
                      )
                    }
                    secondary
                  />
                )}
              </FriendSection>
            )}
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
      {selectedFriend ? (
        <FriendProfileCard
          error={friendProfileError}
          incomingChallenge={challengeForPlayer(
            selectedFriend.player_id,
            'incoming',
          )}
          loading={friendProfileLoading}
          onAcceptChallenge={acceptChallenge}
          onClose={closeFriendProfile}
          onDeclineChallenge={declineChallenge}
          onRetry={() => openFriendProfile(selectedFriend)}
          onBlock={() => confirmBlock(selectedFriend)}
          onReport={() => setReportingPlayer(selectedFriend)}
          onSendChallenge={(player) =>
            runChallengeAction(
              `challenge-send-${player.player_id}`,
              () => sendChallengeInvite(player.player_id),
            )
          }
          outgoingChallenge={challengeForPlayer(
            selectedFriend.player_id,
            'outgoing',
          )}
          player={friendProfile || selectedFriend}
          actionKey={actionKey}
          strings={strings}
        />
      ) : null}
      {reportingPlayer ? (
        <ReportPlayerCard
          actionKey={actionKey}
          onClose={() => setReportingPlayer(null)}
          onSelectReason={(reason) =>
            submitPlayerReport(reportingPlayer, reason)
          }
          player={reportingPlayer}
          strings={strings}
        />
      ) : null}
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

function FriendSection({
  children,
  emptyText,
  onPlayerPress,
  rows,
  strings,
  title,
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}
        {rows.length > 0 ? ` · ${rows.length}` : ''}
      </Text>
      {rows.length > 0 ? (
        rows.map((player) => {
          const playerIdentity = (
            <>
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
            </>
          );

          return (
            <View
              key={`${title}-${player.player_id}`}
              style={styles.playerRow}
            >
              {onPlayerPress ? (
                <Pressable
                  accessibilityLabel={strings.openPlayerProfile(
                    player.display_name || `@${player.username}`,
                  )}
                  accessibilityRole="button"
                  onPress={() => onPlayerPress(player)}
                  style={({ pressed }) => [
                    styles.playerIdentity,
                    pressed && styles.pressed,
                  ]}
                >
                  {playerIdentity}
                </Pressable>
              ) : (
                <View style={styles.playerIdentity}>{playerIdentity}</View>
              )}
              {children(player)}
            </View>
          );
        })
      ) : (
        <Text style={styles.emptyText}>{emptyText}</Text>
      )}
    </View>
  );
}

function FriendProfileCard({
  actionKey,
  error,
  incomingChallenge,
  loading,
  onAcceptChallenge,
  onBlock,
  onClose,
  onDeclineChallenge,
  onRetry,
  onReport,
  onSendChallenge,
  outgoingChallenge,
  player,
  strings,
}) {
  const displayName = player.display_name || `@${player.username}`;

  return (
    <View style={styles.profileOverlay}>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.profileCard}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{strings.profileEyebrow}</Text>
            <Text style={styles.title}>{strings.profileTitle}</Text>
          </View>
          <Pressable
            accessibilityLabel={strings.closeProfile}
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

        <View style={styles.profileIdentity}>
          <View style={styles.profileMark}>
            <Text style={styles.profileMarkText}>
              {displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileIdentityCopy}>
            <Text numberOfLines={1} style={styles.profileName}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={styles.profileUsername}>
              @{player.username}
            </Text>
          </View>
        </View>

        {loading ? (
          <PanelState loading text={strings.profileLoading} />
        ) : error ? (
          <PanelState
            actionLabel={strings.retry}
            onAction={onRetry}
            text={error}
          />
        ) : (
          <>
            <View style={styles.profileStats}>
              <ProfileStat
                label={strings.weeklyScore}
                value={player.weekly_score}
              />
              <ProfileStat
                label={strings.totalScore}
                value={player.total_score}
              />
              <ProfileStat
                label={strings.gamesCompleted}
                value={player.games_completed}
              />
              <ProfileStat
                label={strings.bestScore}
                value={player.best_score}
              />
              <ProfileStat
                label={strings.bestStreak}
                value={player.best_streak}
              />
            </View>
            {incomingChallenge ? (
              <View style={styles.profileChallengeActions}>
                <SmallAction
                  busy={
                    actionKey ===
                    `challenge-decline-${incomingChallenge.invite_id}`
                  }
                  disabled={Boolean(actionKey)}
                  label={strings.declineChallenge}
                  onPress={() => onDeclineChallenge(incomingChallenge)}
                  secondary
                />
                <SmallAction
                  busy={
                    actionKey ===
                    `challenge-accept-${incomingChallenge.invite_id}`
                  }
                  disabled={Boolean(actionKey)}
                  label={strings.acceptChallenge}
                  onPress={() => onAcceptChallenge(incomingChallenge)}
                />
              </View>
            ) : outgoingChallenge ? (
              <View style={styles.challengeSentState}>
                <Text style={styles.challengeSentText}>
                  {strings.challengeSent}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(actionKey)}
                onPress={() => onSendChallenge(player)}
                style={({ pressed }) => [
                  styles.profileChallengeButton,
                  Boolean(actionKey) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {actionKey === `challenge-send-${player.player_id}` ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.profileChallengeButtonText}>
                    {strings.challenge}
                  </Text>
                )}
              </Pressable>
            )}
            <View style={styles.profileSafetyActions}>
              <SmallAction
                disabled={Boolean(actionKey)}
                label={strings.report}
                onPress={onReport}
                secondary
              />
              <SmallAction
                busy={actionKey === `block-${player.player_id}`}
                danger
                disabled={Boolean(actionKey)}
                label={strings.block}
                onPress={onBlock}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function ReportPlayerCard({
  actionKey,
  onClose,
  onSelectReason,
  player,
  strings,
}) {
  const displayName = player.display_name || `@${player.username}`;
  const busy = actionKey.startsWith(`report-${player.player_id}-`);

  return (
    <View style={[styles.profileOverlay, styles.reportOverlay]}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.reportCard}>
        <View style={styles.header}>
          <View style={styles.reportHeaderCopy}>
            <Text style={styles.eyebrow}>{strings.reportEyebrow}</Text>
            <Text style={styles.title}>{strings.reportTitle}</Text>
          </View>
          <Pressable
            accessibilityLabel={strings.closeReport}
            accessibilityRole="button"
            disabled={busy}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.reportPlayerName}>{displayName}</Text>
        <Text style={styles.reportPrompt}>{strings.reportPrompt}</Text>
        <View style={styles.reportReasons}>
          {PLAYER_REPORT_REASONS.map((reason) => {
            const key = `report-${player.player_id}-${reason}`;
            return (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                key={reason}
                onPress={() => onSelectReason(reason)}
                style={({ pressed }) => [
                  styles.reportReason,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.reportReasonText}>
                  {strings.reportReasons[reason]}
                </Text>
                {actionKey === key ? (
                  <ActivityIndicator color="#147b76" size="small" />
                ) : (
                  <Text style={styles.reportReasonArrow}>›</Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.reportPrivacy}>{strings.reportPrivacy}</Text>
      </View>
    </View>
  );
}

function ProfileStat({ label, value }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatLabel}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={styles.profileStatValue}
      >
        {value ?? 0}
      </Text>
    </View>
  );
}

function ActivitySection({
  activities,
  error,
  loading,
  onPlayerPress,
  onRetry,
  strings,
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{strings.activityTitle}</Text>
      {loading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color="#1fa7a0" size="small" />
          <Text style={styles.helperText}>{strings.activityLoading}</Text>
        </View>
      ) : error ? (
        <View style={styles.activityError}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.retryText}>{strings.retry}</Text>
          </Pressable>
        </View>
      ) : activities.length > 0 ? (
        activities.map((activity) => {
          const name =
            activity.display_name || `@${activity.username}`;
          return (
            <Pressable
              accessibilityLabel={`${name} ${strings.activityCompleted}`}
              accessibilityRole="button"
              key={activity.activity_id}
              onPress={() => onPlayerPress(activity)}
              style={({ pressed }) => [
                styles.activityRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.activityMark}>
                <Text style={styles.activityMarkText}>
                  {name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.activityCopy}>
                <View style={styles.activityHeadline}>
                  <Text numberOfLines={1} style={styles.activityTitle}>
                    <Text style={styles.activityName}>{name}</Text>
                    {` ${strings.activityCompleted}`}
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatActivityAge(activity.played_at, strings)}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.activityMeta}>
                  {strings.activitySummary(
                    strings.activityModes[activity.mode],
                    strings.activityDifficulties[activity.difficulty],
                    activity.awarded_score,
                  )}
                </Text>
              </View>
            </Pressable>
          );
        })
      ) : (
        <Text style={styles.emptyText}>{strings.activityEmpty}</Text>
      )}
    </View>
  );
}

function formatActivityAge(value, strings) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (elapsedMinutes < 1) {
    return strings.activityNow;
  }
  if (elapsedMinutes < 60) {
    return strings.activityMinutesAgo(elapsedMinutes);
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return strings.activityHoursAgo(elapsedHours);
  }
  return strings.activityDaysAgo(Math.floor(elapsedHours / 24));
}

function SearchActions({
  actionKey,
  onAccept,
  onAdd,
  onDecline,
  onRemove,
  onReport,
  player,
  strings,
}) {
  if (player.connection_type === 'friend') {
    return (
      <View style={styles.actions}>
        <SmallAction
          disabled={Boolean(actionKey)}
          label={strings.report}
          onPress={onReport}
          secondary
        />
        <SmallAction
          busy={actionKey === `remove-${player.player_id}`}
          disabled={Boolean(actionKey)}
          label={strings.remove}
          onPress={onRemove}
          secondary
        />
      </View>
    );
  }
  if (player.connection_type === 'incoming') {
    return (
      <View style={styles.actions}>
        <SmallAction
          disabled={Boolean(actionKey)}
          label={strings.report}
          onPress={onReport}
          secondary
        />
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
    return (
      <View style={styles.actions}>
        <Text style={styles.sentText}>{strings.sent}</Text>
        <SmallAction
          disabled={Boolean(actionKey)}
          label={strings.report}
          onPress={onReport}
          secondary
        />
      </View>
    );
  }
  return (
    <View style={styles.actions}>
      <SmallAction
        disabled={Boolean(actionKey)}
        label={strings.report}
        onPress={onReport}
        secondary
      />
      <SmallAction
        busy={actionKey === `add-${player.player_id}`}
        disabled={Boolean(actionKey)}
        label={strings.add}
        onPress={onAdd}
      />
    </View>
  );
}

function SmallAction({
  busy = false,
  danger = false,
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
        danger && styles.smallActionDanger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={secondary || danger ? '#147b76' : '#ffffff'}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.smallActionText,
            secondary && styles.smallActionSecondaryText,
            danger && styles.smallActionDangerText,
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
  profileOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.48)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 440,
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
  playerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
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
  profileIdentity: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 12,
  },
  profileMark: {
    alignItems: 'center',
    backgroundColor: '#d9f5f2',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  profileMarkText: {
    color: '#147b76',
    fontSize: 23,
    fontWeight: '900',
  },
  profileIdentityCopy: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  profileName: {
    color: '#20242a',
    fontSize: 18,
    fontWeight: '900',
  },
  profileUsername: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  profileStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  profileChallengeActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  profileSafetyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  reportOverlay: {
    zIndex: 4,
  },
  reportCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  reportHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  reportPlayerName: {
    color: '#20242a',
    fontSize: 16,
    fontWeight: '900',
  },
  reportPrompt: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  reportReasons: {
    gap: 7,
    marginTop: 14,
  },
  reportReason: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  reportReasonText: {
    color: '#20242a',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  reportReasonArrow: {
    color: '#147b76',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  reportPrivacy: {
    color: '#7d8790',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 12,
  },
  profileChallengeButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  profileChallengeButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  challengeSentState: {
    alignItems: 'center',
    backgroundColor: '#e9f8f7',
    borderColor: '#b7e6e2',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 11,
  },
  challengeSentText: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
  },
  profileStat: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 104,
    padding: 10,
  },
  profileStatLabel: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
  },
  profileStatValue: {
    color: '#20242a',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  activityError: {
    backgroundColor: '#fff4f2',
    borderRadius: 8,
    padding: 10,
  },
  activityRow: {
    alignItems: 'center',
    borderBottomColor: '#edf2f5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingVertical: 8,
  },
  activityMark: {
    alignItems: 'center',
    backgroundColor: '#d9f5f2',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  activityMarkText: {
    color: '#147b76',
    fontSize: 16,
    fontWeight: '900',
  },
  activityCopy: {
    flex: 1,
    marginLeft: 9,
    minWidth: 0,
  },
  activityHeadline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  activityTitle: {
    color: '#20242a',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 0,
  },
  activityName: {
    fontWeight: '900',
  },
  activityTime: {
    color: '#7d8790',
    fontSize: 10,
    fontWeight: '800',
  },
  activityMeta: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'flex-end',
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
  smallActionDanger: {
    backgroundColor: '#fff4f2',
    borderColor: '#e9b9b2',
    borderWidth: StyleSheet.hairlineWidth,
  },
  smallActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  smallActionSecondaryText: {
    color: '#147b76',
  },
  smallActionDangerText: {
    color: '#b34b3f',
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
