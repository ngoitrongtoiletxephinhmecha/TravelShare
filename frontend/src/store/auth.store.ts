import { create } from 'zustand';
import { AuthUser, UserProfile } from '../types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (
    user: AuthUser,
    accessToken: string,
    refreshToken?: string | null,
  ) => void;
  updateUserProfile: (profile: UserProfile) => void;
  clearAuth: () => void;
}

const STORAGE_KEY = 'travelshare_auth_v1';

const loadInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null };
    return JSON.parse(raw);
  } catch {
    return { user: null, accessToken: null, refreshToken: null };
  }
};

const initial = loadInitialState();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  accessToken: initial.accessToken,
  refreshToken: initial.refreshToken,
  isAuthenticated: Boolean(initial.user && initial.accessToken),

  setAuth: (user, accessToken, refreshToken = null) => {
    const nextState = { user, accessToken, refreshToken };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // ignore storage errors
    }
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    });
  },

  updateUserProfile: (profile) =>
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, profile };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: updatedUser,
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
          }),
        );
      } catch {
        // ignore
      }
      return { user: updatedUser };
    }),

  clearAuth: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },
}));
