/** Screen bodies: one scrolling page of stacked cards, clear of the phone's navigation bar. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { CardStack, ScrollBody } from '../components/layout';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

test('CardStack shows every card, one under another, with no buttons, and leaves out cards with nothing to show', async () => {
  await render(
    <CardStack
      cards={[
        { key: 'a', node: <Text>Card A</Text> },
        { key: 'b', show: false, node: <Text>Card B</Text> },
        { key: 'c', node: <Text>Card C</Text> },
      ]}
    />,
  );
  expect(screen.getByText('Card A')).toBeTruthy();
  expect(screen.getByText('Card C')).toBeTruthy();
  expect(screen.queryByText('Card B')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

const bottomPadding = () => {
  const style = StyleSheet.flatten(screen.getByTestId('scroll-body').props.contentContainerStyle);
  return style.paddingBottom ?? style.padding;
};

test('a screen with no tab bar leaves room under its last item for the phone navigation bar', async () => {
  await render(
    <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom: 48 }}>
      <ScrollBody bottomInset>
        <Text>Add how it went</Text>
      </ScrollBody>
    </SafeAreaInsetsContext.Provider>,
  );
  expect(bottomPadding()).toBe(16 + 48);
});

test('a scroll body under the tab bar leaves the bottom to the tab bar', async () => {
  await render(
    <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom: 48 }}>
      <ScrollBody>
        <Text>Plan</Text>
      </ScrollBody>
    </SafeAreaInsetsContext.Provider>,
  );
  expect(bottomPadding()).toBe(16);
});

test('a scroll body works without a safe-area provider', async () => {
  await render(
    <ScrollBody bottomInset>
      <Text>In a modal</Text>
    </ScrollBody>,
  );
  expect(bottomPadding()).toBe(16);
});
