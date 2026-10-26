import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useStore } from '../store';
import { colors } from '../theme';

/** Where the Worker sends the phone after Strava sign-in: take the tokens off the link, then go to Settings. */
export default function StravaAuth() {
  const params = useLocalSearchParams();
  const { finishConnect } = useStore();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finishConnect(params).finally(() => router.replace('/settings'));
  }, [params, finishConnect]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
