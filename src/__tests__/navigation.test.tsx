/**
 * Runs the real routes (not stand-ins for them) so that moving between screens is tested too: the cog on Today has
 * to open Settings, and Back has to return to Today.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

declare const __dirname: string;

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-health-connect', () => ({ openHealthConnectSettings: jest.fn(), SdkAvailabilityStatus: {} }));

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('the cog on Today opens Settings, and Back returns to Today', async () => {
  await renderRouter(`${__dirname}/../app`);
  const cog = await screen.findByLabelText('Settings');
  await fireEvent.press(cog);
  expect(await screen.findByText('Race and plan')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));
  await waitFor(() => expect(screen.queryByText('Race and plan')).toBeNull());
  expect(await screen.findByLabelText('Settings')).toBeTruthy();
});
