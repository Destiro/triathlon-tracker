/** The tab bar: the four main screens and the coach. Settings is reached from Today instead. */
import { render } from '@testing-library/react-native';
import React from 'react';
import TabLayout from '../app/(tabs)/_layout';

const mockScreens: { name: string; options: { title?: string } }[] = [];

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => {
  const Screen = (props: (typeof mockScreens)[number]) => {
    mockScreens.push(props);
    return null;
  };
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
  Tabs.Screen = Screen;
  return { Tabs };
});

test('the tab bar has Today, Plan, Stats, Race and Coach, and nothing else', async () => {
  await render(<TabLayout />);
  expect(mockScreens.map((s) => s.options.title)).toEqual(['Today', 'Plan', 'Stats', 'Race', 'Coach']);
  // Settings is its own screen outside the tabs, opened from the cog on Today.
  expect(mockScreens.find((s) => s.name === 'settings')).toBeUndefined();
});
