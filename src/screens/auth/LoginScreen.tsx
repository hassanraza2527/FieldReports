import React, { useState } from 'react';
import { getContainer } from '../../app/container';
import { AppText } from '../../components/atoms/AppText';
import { Button } from '../../components/atoms/Button';
import { TextField } from '../../components/atoms/TextField';
import { Banner } from '../../components/molecules/Banner';
import { colors } from '../../theme';
import { AuthLayout, authErrorMessage, EMAIL_RE, singleLine } from './authShared';

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailErr = !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : null;
  const passErr = password.length === 0 ? 'Enter your password.' : null;

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (emailErr || passErr) return;
    setBusy(true);
    try {
      await getContainer().login(email.trim().toLowerCase(), password);
      // App.tsx switches to Home when the auth store says signedIn.
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see and add your reports"
      footer={
        <>
          <AppText color={colors.muted}>New here?</AppText>
          <Button title="Create an account" variant="secondary" onPress={onRegister} disabled={busy} />
        </>
      }>
      {error ? <Banner tone="attention" title="Could not log in" detail={error} /> : null}
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" textContentType="emailAddress" style={singleLine} error={touched ? emailErr : null} />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none"
        textContentType="password" onSubmitEditing={() => void submit()} style={singleLine} error={touched ? passErr : null} />
      <AppText variant="label" color={colors.primary} onPress={() => setShow(s => !s)}>{show ? 'Hide password' : 'Show password'}</AppText>
      <Button title="Log in" onPress={() => void submit()} loading={busy} />
    </AuthLayout>
  );
}
