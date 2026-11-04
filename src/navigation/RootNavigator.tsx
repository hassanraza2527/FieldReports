import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Text } from 'react-native';
import { ComposeScreen } from '../screens/ComposeScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const icon = (glyph: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
);

/** Bottom tabs for a signed-in user: Home, Reports, Settings. "New report" is a hidden route opened from Home / Reports. */
export const RootNavigator = () => (
  <Tab.Navigator
    initialRouteName="Home"
    backBehavior="history"
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}>
    <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon('🏠') }} />
    <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: icon('📄') }} />
    <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('⚙️') }} />
    <Tab.Screen
      name="Compose"
      component={ComposeScreen}
      options={{ title: 'New report', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
    />
  </Tab.Navigator>
);
