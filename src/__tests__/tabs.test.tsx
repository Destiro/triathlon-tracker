/** The tab bar has four tabs at most. Settings is reached from Today instead. */
import { render } from '@testing-library/react-native';
import React from 'react';
import TabLayout from '../app/(tabs)/_layout';

const mockScreens: { name: string; options: { href?: null; title?: string } }[] = [];

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

test('the tab bar has Today, Plan, Stats and Race, and no more than four', async () => {
  await render(<TabLayout />);
  const shown = mockScreens.filter((s) => s.options.href !== null);
  expect(shown.map((s) => s.options.title)).toEqual(['Today', 'Plan', 'Stats', 'Race']);
  expect(shown.length).toBeLessThanOrEqual(4);
  // Settings still exists as a route, just not as a tab.
  expect(mockScreens.find((s) => s.name === 'settings')?.options.href).toBeNull();
});
