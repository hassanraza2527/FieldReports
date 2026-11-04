import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrap, getContainer } from './app/container';
import { AppText } from './components/atoms/AppText';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './queries/queryClient';
import { AuthNavigator } from './screens/auth/AuthNavigator';
import { OnboardingScreen } from './screens/auth/OnboardingScreen';
import { useAuthStore } from './state/authStore';
import { colors } from './theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = useAuthStore(s => s.status);
  const onboarded = useAuthStore(s => s.onboarded);
  useEffect(() => {
    bootstrap().then(() => setReady(true)).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><AppText variant="heading">Could not start</AppText><AppText color={colors.danger}>{error}</AppText></View>;
  if (!ready || status === 'loading') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          {status === 'signedIn' ? (
            <RootNavigator />
          ) : !onboarded ? (
            <OnboardingScreen onDone={() => void getContainer().completeOnboarding()} />
          ) : (
            <AuthNavigator />
          )}
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
