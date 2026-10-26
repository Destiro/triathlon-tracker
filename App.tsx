import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomTabBarButtonProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabParams } from './src/navigation';
import LogScreen from './src/screens/LogScreen';
import PlanScreen from './src/screens/PlanScreen';
import StatsScreen from './src/screens/StatsScreen';
import TodayScreen from './src/screens/TodayScreen';
import TrackScreen from './src/screens/TrackScreen';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator<TabParams>();

const TAB_ICONS: Record<keyof TabParams, string> = {
  Today: 'home-variant-outline',
  Track: 'record-circle-outline',
  Log: 'notebook-outline',
  Plan: 'calendar-check-outline',
  Stats: 'chart-line',
};

// React Navigation draws a round, unclipped ripple on Android that spills out of the tab and under the system
// navigation bar (Samsung three-button navigation especially). A bounded ripple stays inside the tab.
const TabButton = (props: BottomTabBarButtonProps) => (
  <PlatformPressable {...props} android_ripple={{ borderless: false, color: colors.accentSoft }} />
);

function Root() {
  const { ready } = useStore();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.inkSoft,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={TAB_ICONS[route.name] as never} size={size} color={color} />,
          tabBarButton: TabButton,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        })}
      >
        <Tab.Screen name="Today" component={TodayScreen} />
        <Tab.Screen name="Track" component={TrackScreen} />
        <Tab.Screen name="Log" component={LogScreen} />
        <Tab.Screen name="Plan" component={PlanScreen} />
        <Tab.Screen name="Stats" component={StatsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
