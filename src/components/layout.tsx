import React, { useContext, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { Chips } from './ui';

/**
 * Room to leave under the last thing on a screen so the phone's navigation bar does not cover it. Screens without the
 * tab bar need it: the app draws edge to edge, so their content runs behind the system bar. Zero where no safe-area
 * provider is around (a modal on some phones, the tests).
 */
export function useBottomInset(): number {
  return useContext(SafeAreaInsetsContext)?.bottom ?? 0;
}

/** A screen body that scrolls as one page. Pass bottomInset on screens that have no tab bar under them. */
export function ScrollBody({ children, bottomInset }: { children: React.ReactNode; bottomInset?: boolean }) {
  const bottom = useBottomInset();
  return (
    <ScrollView
      testID="scroll-body"
      style={styles.body}
      contentContainerStyle={[styles.content, bottomInset && { paddingBottom: spacing.lg + bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * The body of a fixed window: it fills the space under the header and does not scroll. If what is in it turns out
 * taller than the space (a long checklist, a small phone) it scrolls after all, so nothing is ever cut off. Until it
 * has been measured it is allowed to scroll.
 */
export function FixedBody({ children }: { children: React.ReactNode }) {
  const [frame, setFrame] = useState<number | null>(null);
  const [content, setContent] = useState<number | null>(null);
  const overflows = frame === null || content === null || content > frame + 1;
  return (
    <ScrollView
      testID="fixed-body"
      style={styles.body}
      contentContainerStyle={styles.content}
      scrollEnabled={overflows}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
      onLayout={(e: LayoutChangeEvent) => setFrame(e.nativeEvent.layout.height)}
      onContentSizeChange={(_w, h) => setContent(h)}
    >
      {children}
    </ScrollView>
  );
}

/** A row of buttons that choose what the window shows, kept above the body so it never scrolls away. */
export function Switcher({ children }: { children: React.ReactNode }) {
  return <View style={styles.switcher}>{children}</View>;
}

export interface PagedCard {
  key: string;
  label: string;
  /** False when there is nothing to show yet: the card and its button are left out. */
  show?: boolean;
  node: React.ReactNode;
}

/** A row of buttons, one per card, and just the chosen card underneath. The first card is shown to begin with. */
export function OneCard({ cards }: { cards: PagedCard[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const shown = cards.filter((c) => c.show !== false);
  if (shown.length === 0) return null;
  const current = shown.find((c) => c.key === picked) ?? shown[0];
  return (
    <>
      {shown.length > 1 && <Chips options={shown.map((c) => ({ value: c.key, label: c.label }))} value={current.key} onChange={setPicked} />}
      {current.node}
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  switcher: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xs },
});
