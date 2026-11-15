import { apiClient } from './api';
import { ActivityType, CursorPaginatedPosts } from '../types';

export type CommunityRole = 'OWNER' | 'MODERATOR' | 'MEMBER';

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  activityType: ActivityType;
  coverUrl: string;
  avatarUrl?: string;
  rules: string[];
  membersCount: number;
  postsCount?: number;
  isJoined?: boolean;
  myRole?: CommunityRole | null;
  createdAt: string;
}

export interface CommunityMemberItem {
  id: string;
  userId: string;
  role: CommunityRole;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    trustScore: number;
  } | null;
}

export const communityService = {
  async listCommunities(params?: {
    q?: string;
    joinedOnly?: boolean;
    activityType?: ActivityType;
    page?: number;
    limit?: number;
  }): Promise<{
    items: CommunitySummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/communities', { params });
    return data.data;
  },

  async createCommunity(payload: {
    name: string;
    description?: string;
    activityType?: ActivityType;
    rules?: string[];
    coverUrl?: string;
    avatarUrl?: string;
  }): Promise<CommunitySummary> {
    const { data } = await apiClient.post('/communities', payload);
    return data.data;
  },

  async getCommunityDetail(slug: string): Promise<CommunitySummary> {
    const { data } = await apiClient.get(`/communities/${slug}`);
    return data.data;
  },

  async getCommunityPosts(
    slug: string,
    params?: { cursor?: string; limit?: number; q?: string },
  ): Promise<CursorPaginatedPosts> {
    const { data } = await apiClient.get(`/communities/${slug}/posts`, {
      params,
    });
    return data.data;
  },

  async getCommunityMembers(
    slug: string,
    params?: { page?: number; limit?: number },
  ): Promise<{
    items: CommunityMemberItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get(`/communities/${slug}/members`, {
      params,
    });
    return data.data;
  },

  async joinCommunity(slug: string): Promise<{
    communityId: string;
    role: CommunityRole;
    membersCount: number;
  }> {
    const { data } = await apiClient.post(`/communities/${slug}/join`);
    return data.data;
  },

  async leaveCommunity(slug: string): Promise<{
    left: boolean;
    membersCount: number;
  }> {
    const { data } = await apiClient.post(`/communities/${slug}/leave`);
    return data.data;
  },

  async updateRules(
    slug: string,
    payload: { rules: string[]; description?: string },
  ): Promise<CommunitySummary> {
    const { data } = await apiClient.patch(`/communities/${slug}/rules`, payload);
    return data.data;
  },

  async assignMemberRole(
    slug: string,
    memberUserId: string,
    role: 'MODERATOR' | 'MEMBER',
  ): Promise<{ userId: string; role: CommunityRole }> {
    const { data } = await apiClient.patch(
      `/communities/${slug}/members/${memberUserId}/role`,
      { role },
    );
    return data.data;
  },

  async transferOwnership(
    slug: string,
    newOwnerId: string,
  ): Promise<{ transferred: boolean; newOwnerId: string }> {
    const { data } = await apiClient.post(
      `/communities/${slug}/transfer-ownership`,
      { newOwnerId },
    );
    return data.data;
  },

  async moderatePost(
    slug: string,
    postId: string,
    payload: { action: 'HIDE' | 'RESTORE'; reason: string },
  ): Promise<{ id: string; isHidden: boolean }> {
    const { data } = await apiClient.patch(
      `/communities/${slug}/posts/${postId}/moderate`,
      payload,
    );
    return data.data;
  },

  async moderateComment(
    slug: string,
    commentId: string,
    payload: { action: 'HIDE' | 'RESTORE'; reason: string },
  ): Promise<{ id: string; isHidden: boolean }> {
    const { data } = await apiClient.patch(
      `/communities/${slug}/comments/${commentId}/moderate`,
      payload,
    );
    return data.data;
  },
};
