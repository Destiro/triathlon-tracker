import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, sportColors, sportIcons, type } from '../theme';
import { PlanSport, Sport } from '../types';

type ButtonVariant = 'primary' | 'quiet' | 'danger' | 'outline';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  style,
  big,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: colors.white, border: colors.accent },
    quiet: { bg: colors.accentSoft, fg: colors.accent, border: colors.accentSoft },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    outline: { bg: 'transparent', fg: colors.accent, border: colors.accent },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon as never} size={big ? 22 : 18} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, big && styles.buttonTextBig, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A round coloured badge with the sport's icon. */
export function SportBadge({ sport, size = 36 }: { sport: Sport | PlanSport | 'multisport'; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: sportColors[sport] }]}>
      <MaterialCommunityIcons name={sportIcons[sport] as never} size={size * 0.55} color={colors.white} />
    </View>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={type.label}>{children}</Text>
      {action}
    </View>
  );
}

/** A thin horizontal bar showing how full something is, from 0 to 1 (overflow is capped). */
export function ProgressBar({ value, color = colors.accent, height = 8 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function Stat({ label, value, sub, align = 'left' }: { label: string; value: string; sub?: string; align?: 'left' | 'center' }) {
  return (
    <View style={[styles.stat, align === 'center' && { alignItems: 'center' }]}>
      <Text style={type.label}>{label}</Text>
      <Text style={type.number} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={type.small}>{sub}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, color = colors.accent, icon }: { label: string; selected: boolean; onPress: () => void; color?: string; icon?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {icon ? <MaterialCommunityIcons name={icon as never} size={16} color={selected ? colors.white : colors.inkSoft} /> : null}
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

/** A labelled text box. */
export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9AA3B2"
        {...input}
        style={[styles.input, error ? { borderColor: colors.danger } : null, input.multiline && { minHeight: 90, textAlignVertical: 'top' }, input.style]}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

/** Picks one option from a short list, like a row of tabs. */
export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon as never} size={44} color={colors.inkSoft} />
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center' }]}>{body}</Text>
      {action}
    </View>
  );
}

/** Effort from 1 to 10 as a row of tappable numbers. */
export function RpePicker({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>Effort (1 easy – 10 all out)</Text>
      <View style={styles.rpeRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          const tint = n <= 3 ? sportColors.run : n <= 6 ? sportColors.bike : colors.danger;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(selected ? undefined : n)}
              style={[styles.rpe, selected && { backgroundColor: tint, borderColor: tint }]}
              accessibilityRole="button"
              accessibilityLabel={`Effort ${n}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.rpeText, selected && { color: colors.white }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  buttonBig: { paddingVertical: spacing.lg, borderRadius: radius.md },
  buttonText: { fontSize: 15, fontWeight: '700' },
  buttonTextBig: { fontSize: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  badge: { alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  track: { backgroundColor: colors.line, overflow: 'hidden', width: '100%' },
  stat: { flex: 1, gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  field: { gap: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  error: { fontSize: 13, color: colors.danger },
  segmented: { flexDirection: 'row', backgroundColor: colors.line, borderRadius: radius.sm, padding: 3 },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm - 2, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  segmentTextSelected: { color: colors.ink },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  rpeRow: { flexDirection: 'row', gap: 4 },
  rpe: { flex: 1, aspectRatio: 1, maxHeight: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rpeText: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
