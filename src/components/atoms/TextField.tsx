import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { AppText } from './AppText';

type Props = TextInputProps & { label: string; error?: string | null };
export const TextField = ({ label, error, style, ...rest }: Props) => (
  <View>
    <AppText variant="label" style={styles.label}>{label}</AppText>
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={colors.muted}
      {...rest}
      style={[styles.input, error ? styles.err : null, style]}
    />
    {error ? <AppText variant="caption" color={colors.danger} style={styles.msg}>{error}</AppText> : null}
  </View>
);
const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs },
  input: {
    minHeight: 120, textAlignVertical: 'top', padding: spacing.md, fontSize: 16, color: colors.text,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  err: { borderColor: colors.danger },
  msg: { marginTop: spacing.xs },
});
