import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ColorValue } from 'react-native';
import { colors } from '../../theme';

const tab = (title: string, icon: string) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={icon as never} size={size} color={color as string} />
  ),
});

export default function TabLayout() {
  return (
    <Tabs
      // Settings is not a tab, so the back button has to return to wherever you opened it from.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Today', 'home-variant-outline')} />
      <Tabs.Screen name="plan" options={tab('Plan', 'calendar-check-outline')} />
      <Tabs.Screen name="stats" options={tab('Stats', 'chart-line')} />
      <Tabs.Screen name="race" options={tab('Race', 'flag-checkered')} />
      {/* No tab: opened from the cog on Today. */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
