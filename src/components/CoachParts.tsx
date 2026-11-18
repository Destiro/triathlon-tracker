import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { looksLikeKey } from '../coach/key';
import { ChatItem } from '../coach/conversation';
import { describeProposal, proposalHeading } from '../coach/tools';
import { colors, radius, spacing, type } from '../theme';
import { Button, Card } from './ui';
import { useVoiceInput } from './useVoiceInput';

/** Asks for an Anthropic API key and says plainly what the coach sends where. */
export function KeySetup({ onSave }: { onSave: (key: string) => Promise<boolean> }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!looksLikeKey(key)) {
      setError('That doesn’t look like an Anthropic API key. They start with sk-ant-.');
      return;
    }
    setSaving(true);
    const ok = await onSave(key);
    setSaving(false);
    if (!ok) setError('The phone would not save the key. Try again.');
  };
  return (
    <Card title="Set up the coach">
      <Text style={type.body}>
        The coach is Claude, through Anthropic’s API, with your own API key. Make one at console.anthropic.com under API keys, and paste it here.
      </Text>
      <Text style={type.small}>
        Your messages, and the training, sleep and notes it looks up to answer them, are sent to Anthropic. Each message is billed to your
        Anthropic account. The key stays in the phone’s secure storage and is not in backups.
      </Text>
      <TextInput
        value={key}
        onChangeText={(t) => {
          setKey(t);
          setError(null);
        }}
        placeholder="sk-ant-…"
        placeholderTextColor={colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
        accessibilityLabel="Anthropic API key"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={saving ? 'Saving…' : 'Save key'} onPress={save} disabled={saving || !key.trim()} />
    </Card>
  );
}

export function Bubble({ item }: { item: Extract<ChatItem, { kind: 'user' | 'coach' | 'error' }> }) {
  if (item.kind === 'error') {
    return (
      <View style={[styles.bubble, styles.errorBubble]} accessibilityRole="alert">
        <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
        <Text style={[type.body, { flex: 1 }]}>{item.text}</Text>
      </View>
    );
  }
  const mine = item.kind === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Text style={type.body} selectable>
        {item.text}
      </Text>
    </View>
  );
}

const SETTLED = {
  applied: { icon: 'check-circle', color: colors.success, label: 'Applied' },
  cancelled: { icon: 'close-circle-outline', color: colors.inkSoft, label: 'Cancelled' },
} as const;

/** A change the coach wants to make, with Apply and Cancel. Nothing is saved until Apply. */
export function ProposalCard({ item, onApply, onCancel }: { item: Extract<ChatItem, { kind: 'proposal' }>; onApply: () => void; onCancel: () => void }) {
  const text = describeProposal(item.proposal);
  return (
    <View style={styles.proposal}>
      <Text style={type.label}>{proposalHeading(item.proposal)}</Text>
      <Text style={type.body}>{text}</Text>
      {item.state === 'pending' ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button label="Apply" onPress={onApply} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="quiet" onPress={onCancel} />
          </View>
        </View>
      ) : (
        <View style={styles.settled}>
          <MaterialCommunityIcons name={SETTLED[item.state].icon} size={18} color={SETTLED[item.state].color} />
          <Text style={[type.small, { color: SETTLED[item.state].color }]}>{SETTLED[item.state].label}</Text>
        </View>
      )}
    </View>
  );
}

export const SUGGESTIONS = ['How did this week go?', 'I slept badly. Should I change today?', 'How is my sleep and recovery trending?', 'Move tomorrow’s workout to the day after'];

/** A few questions to start with, on an empty chat. */
export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={type.small}>Ask about your plan, training, sleep or recovery, or ask it to move things around. Try:</Text>
      {SUGGESTIONS.map((s) => (
        <Pressable key={s} onPress={() => onPick(s)} style={styles.suggestion} accessibilityRole="button">
          <Text style={styles.suggestionText}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Composer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const voice = useVoiceInput(text, setText);
  const canSend = !busy && !voice.listening && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <View style={styles.composerWrap}>
      {voice.error && (
        <View style={styles.voiceError} accessibilityRole="alert">
          <MaterialCommunityIcons name="microphone-off" size={16} color={colors.danger} />
          <Text style={[type.small, { flex: 1 }]}>{voice.error}</Text>
        </View>
      )}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={voice.listening ? 'Listening…' : busy ? 'Thinking…' : 'Ask your coach'}
          placeholderTextColor={colors.inkFaint}
          multiline
          style={[styles.input, styles.composerInput]}
          accessibilityLabel="Message"
        />
        {/* Icon and label change with it, so listening doesn't rest on colour alone. */}
        <Pressable
          onPress={voice.toggle}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? 'Stop listening' : 'Speak a message'}
          accessibilityState={{ selected: voice.listening }}
          style={[styles.mic, voice.listening && styles.micOn, busy && { opacity: 0.4 }]}
        >
          <MaterialCommunityIcons name={voice.listening ? 'stop' : 'microphone'} size={22} color={voice.listening ? colors.onAccent : colors.accent} />
        </Pressable>
        <Pressable onPress={send} disabled={!canSend} hitSlop={8} accessibilityRole="button" accessibilityLabel="Send" style={[styles.send, !canSend && { opacity: 0.4 }]}>
          <MaterialCommunityIcons name="send" size={22} color={colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  error: { color: colors.danger, fontSize: 13 },
  bubble: { borderRadius: radius.md, padding: spacing.md, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accentSoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  errorBubble: { alignSelf: 'stretch', maxWidth: '100%', flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.dangerSoft },
  proposal: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: spacing.sm },
  settled: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  suggestion: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  suggestionText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  composerWrap: { borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  voiceError: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  mic: { borderRadius: radius.pill, padding: spacing.sm, borderWidth: 1, borderColor: colors.accent },
  micOn: { backgroundColor: colors.accent },
  composerInput: { flex: 1, maxHeight: 120 },
  send: { backgroundColor: colors.accent, borderRadius: radius.pill, padding: spacing.sm },
});
