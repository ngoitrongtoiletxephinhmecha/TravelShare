import { create } from 'zustand';
import { AuthUser, UserProfile } from '../types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  isHydratingSession: boolean;
  isAuthenticated: boolean;
  setAuth: (
    user: AuthUser,
    accessToken: string,
    csrfToken?: string | null,
  ) => void;
  setCsrfToken: (csrfToken: string | null) => void;
  setHydratingSession: (hydrating: boolean) => void;
  updateUserProfile: (profile: UserProfile) => void;
  clearAuth: () => void;
}

const STORAGE_KEY = 'travelshare_auth_v1';

const loadInitialUser = (): AuthUser | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = parsed?.user || null;
    // Strip any legacy refreshToken / accessToken previously stored in localStorage
    if (parsed && ('refreshToken' in parsed || 'accessToken' in parsed)) {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    return user;
  } catch {
    return null;
  }
};

const initialUser = loadInitialUser();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialUser,
  accessToken: null,
  csrfToken: null,
  isHydratingSession: Boolean(initialUser),
  isAuthenticated: Boolean(initialUser),

  setAuth: (user, accessToken, csrfToken = null) => {
    // Store ONLY non-sensitive user summary in localStorage; keep tokens out of localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
      }
    } catch {
      // ignore storage errors
    }
    set((state) => ({
      user,
      accessToken,
      csrfToken: csrfToken ?? state.csrfToken,
      isHydratingSession: false,
      isAuthenticated: true,
    }));
  },

  setCsrfToken: (csrfToken) => set({ csrfToken }),

  setHydratingSession: (isHydratingSession) => set({ isHydratingSession }),

  updateUserProfile: (profile) =>
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, profile };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ user: updatedUser }),
          );
        }
      } catch {
        // ignore
      }
      return { user: updatedUser };
    }),

  clearAuth: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    set({
      user: null,
      accessToken: null,
      csrfToken: null,
      isHydratingSession: false,
      isAuthenticated: false,
    });
  },
}));
