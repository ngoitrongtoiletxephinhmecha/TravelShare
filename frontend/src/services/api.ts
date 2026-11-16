import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

export const apiBaseURL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export const apiOrigin = apiBaseURL.replace(/\/api\/v1\/?$/, '');

export const apiClient = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 12000,
});

export function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function resolveCsrfToken(): string | null {
  return readCookieValue('ts_csrf_token') || useAuthStore.getState().csrfToken;
}

let activeCsrfPromise: Promise<string | null> | null = null;
let activeRefreshPromise: Promise<{
  user: any;
  accessToken: string;
  csrfToken?: string;
}> | null = null;

export async function ensureCsrfToken(): Promise<string | null> {
  const existing = resolveCsrfToken();
  if (existing) return existing;
  if (activeCsrfPromise) return activeCsrfPromise;

  activeCsrfPromise = axios
    .get(`${apiBaseURL}/auth/csrf`, { withCredentials: true })
    .then(({ data }) => {
      const token = data?.data?.csrfToken || readCookieValue('ts_csrf_token');
      if (token) {
        useAuthStore.getState().setCsrfToken(token);
      }
      return token || null;
    })
    .catch(() => null)
    .finally(() => {
      activeCsrfPromise = null;
    });

  return activeCsrfPromise;
}

export function refreshSessionSingleFlight(): Promise<{
  user: any;
  accessToken: string;
  csrfToken?: string;
}> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const csrfToken = await ensureCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const { data } = await axios.post(
        `${apiBaseURL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers,
        },
      );
      const payload = data.data;
      useAuthStore
        .getState()
        .setAuth(payload.user, payload.accessToken, payload.csrfToken || csrfToken);
      return payload;
    } catch (refreshError) {
      useAuthStore.getState().clearAuth();
      throw refreshError;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

const SKIP_SESSION_HYDRATE_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/csrf',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/google',
];

apiClient.interceptors.request.use(async (config) => {
  const url = String(config.url || '');
  const state = useAuthStore.getState();

  // If browser reloaded with cached user metadata but no in-memory accessToken yet, restore via HttpOnly cookie first
  if (
    state.user &&
    !state.accessToken &&
    !SKIP_SESSION_HYDRATE_PATHS.some((p) => url.includes(p))
  ) {
    try {
      await refreshSessionSingleFlight();
    } catch {
      // Request proceeds unauthenticated or triggers 401 handling as appropriate
    }
  }

  const latestToken = useAuthStore.getState().accessToken;
  if (latestToken && config.headers) {
    config.headers.Authorization = `Bearer ${latestToken}`;
  }

  const method = String(config.method || 'GET').toUpperCase();
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    config.headers
  ) {
    const csrf = resolveCsrfToken();
    if (csrf) {
      config.headers['X-CSRF-Token'] = csrf;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;
      try {
        const payload = await refreshSessionSingleFlight();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${payload.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    if (status === 403) {
      const msg = String(error?.response?.data?.message || '');
      if (/SUSPENDED|DEACTIVATED|bị khóa/i.test(msg)) {
        useAuthStore.getState().clearAuth();
      }
    }

    return Promise.reject(error);
  },
);
