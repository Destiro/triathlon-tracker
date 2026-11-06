import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, primary ? styles.primary : styles.quiet, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[styles.buttonLabel, { color: primary ? colors.onAccent : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** A rounded card, optionally with a heading. */
export function Card({ title, note, children, style }: { title?: string; note?: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={type.heading}>{title}</Text>}
      {note && <Text style={[type.small, { marginTop: 2 }]}>{note}</Text>}
      {children}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[type.small, { paddingVertical: spacing.md }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  button: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.sm, alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  quiet: { backgroundColor: colors.accentSoft },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
});
