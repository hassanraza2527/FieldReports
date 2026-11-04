import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isApiError } from '../../api/errors';
import { AppText } from '../../components/atoms/AppText';
import { colors, spacing } from '../../theme';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
/** TextField is a tall multiline box by default (for the description); this makes it a normal one-line input. */
export const singleLine = { minHeight: 48, textAlignVertical: 'center' as const };

export function authErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.kind === 'network' || e.kind === 'timeout') return "Can't reach the server. Check your connection and try again.";
    if (e.kind === 'http' && e.status === 401) return 'Wrong email or password.';
    if (e.kind === 'http' && e.status === 409) return 'An account with this email already exists. Try logging in.';
    if (e.kind === 'http' && e.status && e.status < 500) return e.message;
  }
  return 'Something went wrong. Please try again.';
}

export const AuthLayout = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) => (
  <SafeAreaView style={styles.s}>
    <KeyboardAvoidingView style={styles.s} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.c} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}><AppText variant="title" color={colors.primaryText}>FR</AppText></View>
          <AppText variant="title">{title}</AppText>
          <AppText color={colors.muted}>{subtitle}</AppText>
        </View>
        <View style={styles.form}>{children}</View>
        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  s: { flex: 1, backgroundColor: colors.bg },
  c: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.xs },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  form: { gap: spacing.lg },
  footer: { alignItems: 'center', gap: spacing.sm },
});
