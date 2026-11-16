import { apiBaseURL, apiClient, refreshSessionSingleFlight } from './api';
import { AuthResponse, AuthUser, UserProfile } from '../types';

export const authService = {
  async register(payload: {
    email: string;
    password: string;
    fullName: string;
    username?: string;
  }): Promise<AuthResponse> {
    const { data } = await apiClient.post('/auth/register', payload);
    return data.data;
  },

  async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const { data } = await apiClient.post('/auth/login', payload);
    return data.data;
  },

  async getGoogleOAuthStatus(): Promise<{
    provider: 'google';
    configured: boolean;
    message: string;
  }> {
    const { data } = await apiClient.get('/auth/google/status');
    return data.data;
  },

  getGoogleLoginUrl(redirectPath = '/feed'): string {
    return `${apiBaseURL}/auth/google?redirect=${encodeURIComponent(redirectPath)}`;
  },

  async refreshSession() {
    return refreshSessionSingleFlight();
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async revokeAllSessions(): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/sessions/revoke-all');
    return data.data;
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await apiClient.get('/auth/me');
    return data.data;
  },

  async forgotPassword(email: string): Promise<{
    message: string;
    devResetTokenPreview?: string;
  }> {
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data.data;
  },

  async resetPassword(payload: {
    email: string;
    resetToken: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await apiClient.post('/auth/reset-password', payload);
    return data.data;
  },

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await apiClient.patch('/auth/change-password', payload);
    return data.data;
  },

  async updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
    const { data } = await apiClient.patch('/users/me/profile', payload);
    return data.data;
  },
};
