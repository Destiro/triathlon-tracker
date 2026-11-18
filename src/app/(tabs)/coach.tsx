import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { claudeSender, COACH_MODELS } from '../../coach/api';
import { Conversation, newConversation, sendMessage, settleProposal } from '../../coach/conversation';
import { systemPrompt } from '../../coach/prompt';
import { applyProposal, CoachData } from '../../coach/tools';
import { Bubble, Composer, KeySetup, ProposalCard, Suggestions } from '../../components/CoachParts';
import { useStore, useTodayKey } from '../../store';
import { colors, spacing, type } from '../../theme';

const makeId = () => Math.random().toString(36).slice(2, 10);

/** Chat with Claude about the plan, training, sleep and recovery. Changes it suggests wait for your Apply. */
export default function CoachScreen() {
  const store = useStore();
  const { settings, coachKey, saveCoachKey } = store;
  const todayKey = useTodayKey();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const data: CoachData = {
    todayKey,
    settings,
    schedule: store.schedule,
    activities: store.activities,
    activitiesByDate: store.activitiesByDate,
    health: store.health,
    notes: store.notes,
    issues: store.issues,
  };

  const send = async (text: string) => {
    if (!coachKey || busy) return;
    // The instructions are fixed for the life of a chat; a new chat picks up today's date and any new settings.
    const current = conv ?? newConversation(systemPrompt(settings, todayKey));
    setConv({ ...current, items: [...current.items, { id: 'sending', kind: 'user', text }] });
    setBusy(true);
    const next = await sendMessage(current, text, data, claudeSender(coachKey, settings.coachModel), makeId);
    setConv(next);
    setBusy(false);
  };

  const settle = (itemId: string, apply: boolean) => {
    if (!conv) return;
    const item = conv.items.find((i) => i.id === itemId);
    if (apply && item?.kind === 'proposal' && item.state === 'pending') applyProposal(item.proposal, store);
    setConv(settleProposal(conv, itemId, apply));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.title}>Coach</Text>
          {coachKey && <Text style={type.small}>Claude {COACH_MODELS[settings.coachModel].label}</Text>}
        </View>
        {conv && conv.items.length > 0 && !busy && (
          <Pressable onPress={() => setConv(null)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>New chat</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scroll}
          testID="coach-chat"
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {!coachKey ? (
            <KeySetup onSave={saveCoachKey} />
          ) : !conv || conv.items.length === 0 ? (
            <Suggestions onPick={send} />
          ) : (
            conv.items.map((item) =>
              item.kind === 'proposal' ? (
                <ProposalCard key={item.id} item={item} onApply={() => settle(item.id, true)} onCancel={() => settle(item.id, false)} />
              ) : (
                <Bubble key={item.id} item={item} />
              ),
            )
          )}
          {busy && <Text style={type.small}>Thinking…</Text>}
        </ScrollView>
        {coachKey && <Composer busy={busy} onSend={send} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  link: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
});
