import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'danger';
interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}
const look: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
};

export const Button = ({ title, onPress, variant = 'primary', disabled, loading, testID }: Props) => {
  const l = look[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.base, { backgroundColor: l.bg, borderColor: l.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}>
      {loading ? <ActivityIndicator color={l.fg} /> : <AppText variant="label" color={l.fg}>{title}</AppText>}
    </Pressable>
  );
};
const styles = StyleSheet.create({
  base: { minHeight: TOUCH, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
