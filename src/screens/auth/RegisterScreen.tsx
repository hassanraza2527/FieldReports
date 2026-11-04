import React, { useState } from 'react';
import { getContainer } from '../../app/container';
import { AppText } from '../../components/atoms/AppText';
import { Button } from '../../components/atoms/Button';
import { TextField } from '../../components/atoms/TextField';
import { Banner } from '../../components/molecules/Banner';
import { colors } from '../../theme';
import { AuthLayout, authErrorMessage, EMAIL_RE, MIN_PASSWORD, singleLine } from './authShared';

export function RegisterScreen({ onLogin }: { onLogin: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errs = {
    name: name.trim().length === 0 ? 'Enter your name.' : null,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : null,
    password: password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null,
    confirm: confirm !== password ? 'Passwords do not match.' : null,
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await getContainer().register(name.trim(), email.trim().toLowerCase(), password);
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Sign up to start filing field reports"
      footer={
        <>
          <AppText color={colors.muted}>Already have an account?</AppText>
          <Button title="Log in" variant="secondary" onPress={onLogin} disabled={busy} />
        </>
      }>
      {error ? <Banner tone="attention" title="Could not sign up" detail={error} /> : null}
      <TextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name"
        style={singleLine} error={touched ? errs.name : null} />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" textContentType="emailAddress" style={singleLine} error={touched ? errs.email : null} />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none"
        textContentType="newPassword" style={singleLine} error={touched ? errs.password : null} />
      <TextField label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none"
        textContentType="newPassword" onSubmitEditing={() => void submit()} style={singleLine} error={touched ? errs.confirm : null} />
      <AppText variant="label" color={colors.primary} onPress={() => setShow(s => !s)}>{show ? 'Hide passwords' : 'Show passwords'}</AppText>
      <Button title="Create account" onPress={() => void submit()} loading={busy} />
    </AuthLayout>
  );
}
