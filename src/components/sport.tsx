import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WorkoutKind } from '../plan/types';
import { sportColors, sportIcons, sportTints } from '../theme';

export type Kind = WorkoutKind | 'other';

export const SPORT_LABELS: Record<Kind, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  brick: 'Brick',
  race: 'Race',
  other: 'Other',
};

export const colorOf = (kind: Kind) => sportColors[kind];
export const tintOf = (kind: Kind) => sportTints[kind];

/** A round badge with the sport's icon, in the sport's colour. */
export function SportBadge({ kind, size = 40 }: { kind: Kind; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: tintOf(kind) }]}>
      <MaterialCommunityIcons name={sportIcons[kind] as never} size={size * 0.58} color={colorOf(kind)} />
    </View>
  );
}

const styles = StyleSheet.create({ badge: { alignItems: 'center', justifyContent: 'center' } });
