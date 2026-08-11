import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function LeagueLeaderboard({
  accountReady,
  error,
  league,
  loading,
  onOpenAccount,
  onRetry,
  profileReady,
  rows,
  strings,
  weekKey,
}) {
  const participantCount = rows[0]?.participant_count || 0;
  const leagueName = strings.leagues[rows[0]?.league_key || league.id];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{strings.home.leagueBoardTitle}</Text>
          <Text style={styles.subtitle}>
            {leagueName} · {weekKey}
          </Text>
        </View>
        {participantCount > 0 ? (
          <Text style={styles.count}>
            {strings.home.leagueBoardPlayers(participantCount)}
          </Text>
        ) : null}
      </View>

      {!accountReady ? (
        <AccessState
          action={strings.home.leagueBoardAccountAction}
          message={strings.home.leagueBoardAccountRequired}
          onPress={onOpenAccount}
        />
      ) : !profileReady ? (
        <AccessState
          action={strings.home.leagueBoardProfileAction}
          message={strings.home.leagueBoardProfileRequired}
          onPress={onOpenAccount}
        />
      ) : loading && rows.length === 0 ? (
        <View style={styles.messageRow}>
          <ActivityIndicator color="#1fa7a0" size="small" />
          <Text style={styles.message}>{strings.home.leagueBoardLoading}</Text>
        </View>
      ) : error && rows.length === 0 ? (
        <View style={styles.messageRow}>
          <Text style={styles.message}>{strings.home.leagueBoardError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.smallButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.smallButtonText}>
              {strings.home.leagueBoardRetry}
            </Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{strings.home.leagueBoardEmpty}</Text>
      ) : (
        rows.map((row, index) => {
          const previousPosition = rows[index - 1]?.position || 0;
          const hasGap = index > 0 && row.position > previousPosition + 1;
          const playerName =
            row.display_name ||
            (row.username ? `@${row.username}` : strings.settings.you);

          return (
            <View key={row.player_id}>
              {hasGap ? <Text style={styles.gap}>···</Text> : null}
              <View
                accessible
                accessibilityLabel={strings.home.leagueBoardRowLabel(
                  row.position,
                  playerName,
                  row.score,
                )}
                style={[styles.row, row.is_current_user && styles.userRow]}
              >
                <Text
                  style={[
                    styles.position,
                    row.is_current_user && styles.userText,
                  ]}
                >
                  {row.position}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.name,
                    row.is_current_user && styles.userText,
                  ]}
                >
                  {playerName}
                  {row.is_current_user
                    ? ` · ${strings.home.leagueBoardYou}`
                    : ''}
                </Text>
                <Text
                  style={[
                    styles.score,
                    row.is_current_user && styles.userText,
                  ]}
                >
                  {row.score}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function AccessState({ action, message, onPress }) {
  return (
    <View style={styles.accessState}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.accessButton, pressed && styles.pressed]}
      >
        <Text style={styles.accessButtonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  accessButton: {
    alignItems: 'center',
    backgroundColor: '#20a9a2',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
  },
  accessButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  accessState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
  },
  count: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '900',
  },
  empty: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingVertical: 12,
  },
  gap: {
    color: '#a0a8af',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 2,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    color: '#68737d',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  messageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 50,
  },
  name: {
    color: '#20242a',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  position: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    width: 30,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#e5eaee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 7,
  },
  score: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
  },
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe6ea',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 14,
  },
  smallButton: {
    borderColor: '#1fa7a0',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallButtonText: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
  },
  subtitle: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  title: {
    color: '#20242a',
    fontSize: 15,
    fontWeight: '900',
  },
  userRow: {
    backgroundColor: '#dff7f4',
    borderRadius: 7,
  },
  userText: {
    color: '#147b76',
  },
});
