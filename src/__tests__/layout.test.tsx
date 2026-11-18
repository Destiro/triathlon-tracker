/** The fixed windows: no scrolling when the content fits, scrolling as a safety valve when it does not. */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { FixedBody, OneCard, ScrollBody } from '../components/layout';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

const measure = async (frame: number, content: number) => {
  const body = screen.getByTestId('fixed-body');
  await fireEvent(body, 'layout', { nativeEvent: { layout: { height: frame, width: 360, x: 0, y: 0 } } });
  await fireEvent(body, 'contentSizeChange', 360, content);
  return screen.getByTestId('fixed-body');
};

test('a body that fits does not scroll', async () => {
  await render(
    <FixedBody>
      <Text>One card</Text>
    </FixedBody>,
  );
  expect((await measure(700, 400)).props.scrollEnabled).toBe(false);
});

test('a body that is taller than the screen still scrolls, so nothing is cut off', async () => {
  await render(
    <FixedBody>
      <Text>A long list</Text>
    </FixedBody>,
  );
  expect((await measure(500, 900)).props.scrollEnabled).toBe(true);
});

test('before it has been measured a body is allowed to scroll', async () => {
  await render(
    <FixedBody>
      <Text>Not measured yet</Text>
    </FixedBody>,
  );
  expect(screen.getByTestId('fixed-body').props.scrollEnabled).toBe(true);
});

test('OneCard shows the first card and a button for each, and leaves out cards with nothing to show', async () => {
  await render(
    <OneCard
      cards={[
        { key: 'a', label: 'Alpha', node: <Text>Card A</Text> },
        { key: 'b', label: 'Beta', show: false, node: <Text>Card B</Text> },
        { key: 'c', label: 'Gamma', node: <Text>Card C</Text> },
      ]}
    />,
  );
  expect(screen.getByText('Card A')).toBeTruthy();
  expect(screen.queryByText('Beta')).toBeNull();
  await fireEvent.press(screen.getByText('Gamma'));
  expect(screen.getByText('Card C')).toBeTruthy();
  expect(screen.queryByText('Card A')).toBeNull();
});

test('OneCard with a single card has no buttons', async () => {
  await render(<OneCard cards={[{ key: 'a', label: 'Alpha', node: <Text>Card A</Text> }]} />);
  expect(screen.getByText('Card A')).toBeTruthy();
  expect(screen.queryByText('Alpha')).toBeNull();
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
