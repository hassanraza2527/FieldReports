import { create } from 'zustand';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
interface AuthState {
  status: AuthStatus;
  email: string | null;
  name: string | null;
  /** Has this phone already seen the welcome slides? (persisted in the local meta table) */
  onboarded: boolean;
  /** Why we were sent back to the login screen (e.g. the queued sign-up was refused). */
  notice: string | null;
}
export const useAuthStore = create<AuthState>(() => ({ status: 'loading', email: null, name: null, onboarded: false, notice: null }));