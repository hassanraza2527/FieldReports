import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrap } from './app/container';
import { AppText } from './components/atoms/AppText';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './queries/queryClient';
import { colors } from './theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    bootstrap().then(() => setReady(true)).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><AppText variant="heading">Could not start</AppText><AppText color={colors.danger}>{error}</AppText></View>;
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
