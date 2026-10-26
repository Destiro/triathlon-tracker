import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Shown at the top right, e.g. an edit button. */
  action?: React.ReactNode;
}

function Header({ title, onClose, action }: Omit<Props, 'children'>) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
        <MaterialCommunityIcons name="close" size={26} color={colors.ink} />
      </Pressable>
      <Text style={[type.heading, styles.title]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.action}>{action}</View>
    </View>
  );
}

/**
 * A full-screen page for reading. It draws behind the status and navigation bars so there's no grey band at
 * the top or bottom, and keeps its content clear of both. Mount it to open.
 */
export function PageModal({ title, onClose, children, action }: Props) {
  return (
    <Modal visible statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.screen}>
        <Header title={title} onClose={onClose} action={action} />
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * A full-screen form. Unlike PageModal it stays inside the system bars, which lets Android shrink it when the
 * keyboard opens so text boxes are never hidden. Mount it to open.
 */
export function FormModal({ title, onClose, children, action }: Props) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <Header title={title} onClose={onClose} action={action} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  close: { padding: spacing.xs },
  title: { flex: 1 },
  action: { minWidth: 26, alignItems: 'flex-end' },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
});
