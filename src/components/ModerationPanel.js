import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  loadPlayerReportActions,
  loadPlayerReports,
  moderatePlayerReport,
} from '../services/moderationService';

const REPORT_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'];

export default function ModerationPanel({
  language,
  onClose,
  role,
  strings,
  visible,
}) {
  const [status, setStatus] = useState('pending');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [historyReportId, setHistoryReportId] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!role) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      setReports(await loadPlayerReports(status, 100));
    } catch {
      setReports([]);
      setError(strings.loadError);
    } finally {
      setLoading(false);
    }
  }, [role, status, strings.loadError]);

  useEffect(() => {
    if (!visible) {
      setStatus('pending');
      setReports([]);
      setError('');
      setBusyId('');
      setHistoryReportId('');
      setHistory([]);
      return;
    }
    refresh();
  }, [refresh, visible]);

  const runDecision = async (report, action, resolution = null) => {
    setBusyId(report.report_id);
    setError('');
    try {
      await moderatePlayerReport({
        action,
        reportId: report.report_id,
        resolution,
      });
      if (historyReportId === report.report_id) {
        setHistory(await loadPlayerReportActions(report.report_id));
      }
      await refresh();
    } catch {
      setError(strings.actionError);
    } finally {
      setBusyId('');
    }
  };

  const confirmDecision = (report, action, resolution, label) => {
    Alert.alert(strings.confirmTitle, strings.confirmText, [
      { style: 'cancel', text: strings.cancel },
      {
        onPress: () => runDecision(report, action, resolution),
        style: resolution === 'profile_cleared' ? 'destructive' : 'default',
        text: label,
      },
    ]);
  };

  const toggleHistory = async (reportId) => {
    if (historyReportId === reportId) {
      setHistoryReportId('');
      setHistory([]);
      return;
    }
    setHistoryReportId(reportId);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await loadPlayerReportActions(reportId));
    } catch {
      setError(strings.historyError);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!visible || !role) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
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

          <View style={styles.statusRow}>
            {REPORT_STATUSES.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: status === item }}
                key={item}
                onPress={() => setStatus(item)}
                style={({ pressed }) => [
                  styles.statusButton,
                  status === item && styles.statusButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.statusText,
                    status === item && styles.statusTextActive,
                  ]}
                >
                  {strings.statuses[item]}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#1fa7a0" />
              <Text style={styles.note}>{strings.loading}</Text>
            </View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{strings.emptyTitle}</Text>
              <Text style={styles.note}>{strings.emptyText}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {reports.map((report) => (
                <ReportRow
                  busy={busyId === report.report_id}
                  history={
                    historyReportId === report.report_id ? history : null
                  }
                  historyLoading={
                    historyReportId === report.report_id && historyLoading
                  }
                  key={report.report_id}
                  language={language}
                  onDecision={(action, resolution, label) =>
                    confirmDecision(report, action, resolution, label)
                  }
                  onHistory={() => toggleHistory(report.report_id)}
                  report={report}
                  strings={strings}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ReportRow({
  busy,
  history,
  historyLoading,
  language,
  onDecision,
  onHistory,
  report,
  strings,
}) {
  const playerName =
    report.display_name_snapshot || `@${report.username_snapshot}`;

  return (
    <View style={styles.reportRow}>
      <View style={styles.reportHeader}>
        <View style={styles.reportIdentity}>
          <Text numberOfLines={1} style={styles.playerName}>
            {playerName}
          </Text>
          <Text style={styles.meta}>
            @{report.username_snapshot} ·{' '}
            {formatDate(report.created_at, language)}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{report.related_open_reports}</Text>
        </View>
      </View>
      <Text style={styles.reason}>{strings.reasons[report.reason]}</Text>
      {report.resolution ? (
        <Text style={styles.note}>{strings.resolutions[report.resolution]}</Text>
      ) : null}

      {busy ? (
        <ActivityIndicator color="#1fa7a0" size="small" />
      ) : report.status === 'pending' ? (
        <ActionButton
          label={strings.review}
          onPress={() => onDecision('review', null, strings.review)}
        />
      ) : report.status === 'reviewing' ? (
        <View style={styles.actionGrid}>
          <ActionButton
            destructive
            label={strings.clearProfile}
            onPress={() =>
              onDecision('resolve', 'profile_cleared', strings.clearProfile)
            }
          />
          <ActionButton
            label={strings.handledExternally}
            onPress={() =>
              onDecision(
                'resolve',
                'handled_externally',
                strings.handledExternally,
              )
            }
          />
          <ActionButton
            label={strings.noViolation}
            onPress={() =>
              onDecision('dismiss', 'no_violation', strings.noViolation)
            }
          />
          <ActionButton
            label={strings.duplicate}
            onPress={() =>
              onDecision('dismiss', 'duplicate', strings.duplicate)
            }
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onHistory}
        style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
      >
        <Text style={styles.historyButtonText}>
          {history ? strings.hideHistory : strings.showHistory}
        </Text>
      </Pressable>
      {historyLoading ? (
        <ActivityIndicator color="#1fa7a0" size="small" />
      ) : history ? (
        history.length > 0 ? (
          history.map((item) => (
            <View key={item.action_id} style={styles.historyRow}>
              <Text style={styles.historyTitle}>
                {strings.actions[item.action]}
              </Text>
              <Text style={styles.meta}>
                {strings.statuses[item.previous_status]} →{' '}
                {strings.statuses[item.next_status]} ·{' '}
                {formatDate(item.created_at, language)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.note}>{strings.noHistory}</Text>
        )
      ) : null}
    </View>
  );
}

function ActionButton({ destructive = false, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        destructive && styles.actionButtonDestructive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={2}
        style={[
          styles.actionButtonText,
          destructive && styles.actionButtonTextDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatDate(value, language) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#dff7f4',
    borderRadius: 7,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: '47%',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  actionButtonDestructive: {
    backgroundColor: '#fff0f0',
  },
  actionButtonText: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  actionButtonTextDestructive: {
    color: '#a43a3a',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    maxHeight: '90%',
    padding: 14,
    width: '94%',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#e4e9ed',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeText: {
    color: '#20242a',
    fontSize: 27,
    fontWeight: '900',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#dff7f4',
    borderRadius: 7,
    height: 30,
    justifyContent: 'center',
    width: 34,
  },
  countText: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 190,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#20242a',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },
  error: {
    backgroundColor: '#fff0f0',
    borderRadius: 7,
    color: '#a43a3a',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    padding: 9,
  },
  eyebrow: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  historyButton: {
    alignItems: 'center',
    borderColor: '#dbe3e8',
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    padding: 8,
  },
  historyButtonText: {
    color: '#56616b',
    fontSize: 10,
    fontWeight: '900',
  },
  historyRow: {
    borderTopColor: '#e5eaee',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  historyTitle: {
    color: '#20242a',
    fontSize: 11,
    fontWeight: '900',
  },
  loadingState: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    minHeight: 190,
  },
  meta: {
    color: '#7c8791',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  note: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 28, 34, 0.52)',
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 72,
  },
  playerName: {
    color: '#20242a',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  reason: {
    color: '#56616b',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
  },
  reportHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  reportIdentity: {
    flex: 1,
    minWidth: 0,
  },
  reportRow: {
    borderBottomColor: '#dbe3e8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  statusButton: {
    alignItems: 'center',
    backgroundColor: '#f3f6f8',
    borderRadius: 7,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 4,
  },
  statusButtonActive: {
    backgroundColor: '#1fa7a0',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 9,
  },
  statusText: {
    color: '#68737d',
    fontSize: 9,
    fontWeight: '900',
  },
  statusTextActive: {
    color: '#ffffff',
  },
  title: {
    color: '#20242a',
    fontSize: 24,
    fontWeight: '900',
  },
});
