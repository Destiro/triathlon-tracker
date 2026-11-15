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


/** A row of two to four page names at the top of a screen; one is shown at a time. */
export function Segments<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small buttons inside a card to switch what it shows, such as Swim / Bike / Run. */
export function Chips<T extends string>({ options, value, onChange, colorOf }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; colorOf?: (v: T) => string }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        const color = colorOf ? colorOf(o.value) : colors.accent;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, on && { borderColor: color, backgroundColor: colors.bg }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            hitSlop={4}
          >
            <Text style={[styles.chipLabel, on && { color }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.sm, alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  quiet: { backgroundColor: colors.accentSoft },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  segments: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm - 2 },
  segmentOn: { backgroundColor: colors.accentSoft },
  segmentLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  segmentLabelOn: { color: colors.accent },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: { paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipLabel: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
});
