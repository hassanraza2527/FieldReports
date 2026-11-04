import { create } from 'zustand';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
interface AuthState {
  status: AuthStatus;
  email: string | null;
  name: string | null;
  /** Has this phone already seen the welcome slides? (persisted in the local meta table) */
  onboarded: boolean;
}
export const useAuthStore = create<AuthState>(() => ({ status: 'loading', email: null, name: null, onboarded: false }));
