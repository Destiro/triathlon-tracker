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
      <Tabs.Screen name="settings" options={tab('Settings', 'cog-outline')} />
    </Tabs>
  );
}
