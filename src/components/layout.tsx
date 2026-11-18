import React, { useContext } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

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

export interface StackedCard {
  key: string;
  /** False when there is nothing to show yet: the card is left out. */
  show?: boolean;
  node: React.ReactNode;
}

/** Every card that has something to show, one under another, so a page needs no buttons to see all of it. */
export function CardStack({ cards }: { cards: StackedCard[] }) {
  return (
    <>
      {cards
        .filter((c) => c.show !== false)
        .map((c) => (
          <React.Fragment key={c.key}>{c.node}</React.Fragment>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
});
