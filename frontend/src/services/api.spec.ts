// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { apiClient } from './api';
import { useAuthStore } from '../store/auth.store';

describe('Phase 9D Web Session, Cookie CSRF & Single-Flight Refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('never persists refreshToken or accessToken in localStorage', () => {
    useAuthStore.getState().setAuth(
      {
        id: 'user-1',
        email: 'user@travelshare.vn',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: null,
      },
      'secret-access-token-in-memory',
      'csrf-token-value',
    );

    expect(useAuthStore.getState().accessToken).toBe(
      'secret-access-token-in-memory',
    );
    const rawStored = localStorage.getItem('travelshare_auth_v1') || '';
    expect(rawStored).not.toContain('refreshToken');
    expect(rawStored).not.toContain('accessToken');
    expect(rawStored).not.toContain('secret-access-token-in-memory');
  });

  it('recovers two concurrent 401 requests using a single shared /auth/refresh flight', async () => {
    useAuthStore.getState().setAuth(
      {
        id: 'user-a',
        email: 'a@travelshare.vn',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: null,
      },
      'expired-access-token',
      'csrf-abc-123',
    );

    let refreshCalls = 0;
    const postSpy = vi.spyOn(axios, 'post').mockImplementation(async (url: string) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return {
          data: {
            data: {
              user: useAuthStore.getState().user,
              accessToken: 'fresh-access-token',
              csrfToken: 'csrf-fresh-456',
            },
          },
        } as any;
      }
      throw new Error(`Unexpected axios.post URL: ${url}`);
    });

    const adapterSpy = vi.fn().mockImplementation(async (config: any) => {
      const authHeader = config.headers?.Authorization || config.headers?.get?.('Authorization');
      if (authHeader === 'Bearer expired-access-token') {
        const err: any = new Error('Unauthorized');
        err.config = config;
        err.response = { status: 401, data: { message: 'Token expired' } };
        throw err;
      }
      return {
        status: 200,
        data: { data: { ok: true, url: config.url } },
        headers: {},
        config,
      };
    });

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = adapterSpy;

    try {
      const [res1, res2] = await Promise.all([
        apiClient.get('/notifications'),
        apiClient.get('/bookings/sent'),
      ]);

      expect(refreshCalls).toBe(1);
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(res1.data.data.ok).toBe(true);
      expect(res2.data.data.ok).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe('fresh-access-token');
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});
