/** The month calendar keeps its cells roomy, and tightens them only when the month needs six weeks. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { FormCard } from '../components/RaceCards';
import { MonthGrid } from '../components/MonthGrid';
import { buildSchedule } from '../plan/schedule';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

const schedule = buildSchedule('2026-10-19', '2027-03-05', 'Ironman 70.3 New Zealand');
const heightOf = (label: string) => StyleSheet.flatten(screen.getByLabelText(label).props.style).height;

const grid = (month: Date) => (
  <MonthGrid month={month} schedule={schedule} activitiesByDate={new Map()} todayKey="2026-11-17" selected="2026-11-17" onSelect={() => {}} />
);

test('a month of five weeks has the full size cells', async () => {
  await render(grid(new Date(2026, 11, 1))); // December 2026
  expect(heightOf('Tuesday, 1 Dec')).toBe(52);
});

test('a month of six weeks has slightly shorter cells, with the date still above the dots', async () => {
  await render(grid(new Date(2026, 10, 1))); // November 2026
  expect(heightOf('Tuesday, 17 Nov')).toBe(44);
});

test('Form on race day explains itself when there is nothing to project yet, instead of going missing', async () => {
  await render(<FormCard projection={null} />);
  expect(screen.getByText('Form on race day')).toBeTruthy();
  expect(screen.getByText(/Not available yet/)).toBeTruthy();
});
