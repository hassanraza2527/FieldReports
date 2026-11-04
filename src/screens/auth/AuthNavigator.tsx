import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';

/** Login <-> Register. Plain state (no extra navigation library); the Android back button on Register returns to Login. */
export function AuthNavigator() {
  const [route, setRoute] = useState<'login' | 'register'>('login');
  useEffect(() => {
    if (route !== 'register') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setRoute('login');
      return true;
    });
    return () => sub.remove();
  }, [route]);
  return route === 'login' ? <LoginScreen onRegister={() => setRoute('register')} /> : <RegisterScreen onLogin={() => setRoute('login')} />;
}
