import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ChallengeHistory({
  error,
  language,
  loading,
  onRetry,
  rows,
  strings,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.historyTitle}</Text>
        {rows.length > 0 ? (
          <Text style={styles.count}>{rows.length}</Text>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.messageRow}>
          <ActivityIndicator color="#1fa7a0" size="small" />
          <Text style={styles.message}>{strings.historyLoading}</Text>
        </View>
      ) : error && rows.length === 0 ? (
        <View style={styles.messageRow}>
          <Text style={styles.message}>{strings.historyLoadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryText}>{strings.historyRetry}</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{strings.historyEmpty}</Text>
      ) : (
        rows.map((row) => (
          <HistoryRow
            key={row.room_id}
            language={language}
            row={row}
            strings={strings}
          />
        ))
      )}
    </View>
  );
}

function HistoryRow({ language, row, strings }) {
  const outcome = strings.historyOutcomes[row.outcome];
  const opponentName =
    row.opponent_display_name || `@${row.opponent_username}`;

  return (
    <View
      accessible
      accessibilityLabel={`${outcome.label}, ${opponentName}, ${row.own_score} - ${row.opponent_score}`}
      style={styles.row}
    >
      <View
        style={[
          styles.outcomeBadge,
          row.outcome === 'won' && styles.wonBadge,
          row.outcome === 'lost' && styles.lostBadge,
        ]}
      >
        <Text
          style={[
            styles.outcomeCode,
            row.outcome === 'won' && styles.wonText,
            row.outcome === 'lost' && styles.lostText,
          ]}
        >
          {outcome.code}
        </Text>
      </View>
      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.opponent}>
          {opponentName}
        </Text>
        <Text style={styles.date}>
          {formatHistoryDate(row.completed_at, language)}
        </Text>
      </View>
      <View style={styles.result}>
        <Text style={styles.score}>
          {row.own_score} - {row.opponent_score}
        </Text>
        <Text style={styles.meta}>
          {strings.historyMoves(row.own_moves)} · {formatDuration(row.own_duration_seconds)}
        </Text>
      </View>
    </View>
  );
}

function formatHistoryDate(value, language) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }
  return [minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

const styles = StyleSheet.create({
  count: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
  },
  date: {
    color: '#7c8791',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  empty: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingVertical: 9,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  lostBadge: {
    backgroundColor: '#f1f3f5',
  },
  lostText: {
    color: '#68737d',
  },
  message: {
    color: '#68737d',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  messageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  meta: {
    color: '#7c8791',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  opponent: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
  },
  outcomeBadge: {
    alignItems: 'center',
    backgroundColor: '#fff4c9',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  outcomeCode: {
    color: '#7d6714',
    fontSize: 12,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  result: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  retryButton: {
    borderColor: '#1fa7a0',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  retryText: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#e5eaee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    minHeight: 54,
    paddingVertical: 8,
  },
  score: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  section: {
    marginTop: 16,
  },
  title: {
    color: '#20242a',
    fontSize: 15,
    fontWeight: '900',
  },
  wonBadge: {
    backgroundColor: '#d7f5f2',
  },
  wonText: {
    color: '#147b76',
  },
});
