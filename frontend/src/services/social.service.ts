import { apiClient } from './api';
import {
  ActivityType,
  CommentItem,
  CursorPaginatedPosts,
  PostItem,
  PublicUserProfile,
  TrendingHashtag,
  UploadedMediaItem,
  UserConnectionItem,
} from '../types';

export interface FeedQueryParams {
  cursor?: string;
  limit?: number;
  feedType?: 'latest' | 'following' | 'featured' | 'saved';
  authorId?: string;
  communityId?: string;
  hashtag?: string;
  activityType?: ActivityType;
  q?: string;
}

export const socialService = {
  async getPostsFeed(params: FeedQueryParams): Promise<CursorPaginatedPosts> {
    const { data } = await apiClient.get('/posts', { params });
    return data.data;
  },

  async getPostById(postId: string): Promise<PostItem> {
    const { data } = await apiClient.get(`/posts/${postId}`);
    return data.data;
  },

  async createPost(payload: {
    content: string;
    mediaUrls?: string[];
    hashtags?: string[];
    locationName?: string;
    activityType?: ActivityType;
    gearTags?: string[];
    communityId?: string;
  }): Promise<PostItem> {
    const { data } = await apiClient.post('/posts', payload);
    return data.data;
  },

  async updatePost(
    postId: string,
    payload: {
      content?: string;
      mediaUrls?: string[];
      hashtags?: string[];
      locationName?: string;
      activityType?: ActivityType;
    },
  ): Promise<PostItem> {
    const { data } = await apiClient.patch(`/posts/${postId}`, payload);
    return data.data;
  },

  async deletePost(postId: string): Promise<{ deleted: boolean; postId: string }> {
    const { data } = await apiClient.delete(`/posts/${postId}`);
    return data.data;
  },

  async likePost(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const { data } = await apiClient.post(`/posts/${postId}/like`);
    return data.data;
  },

  async unlikePost(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const { data } = await apiClient.delete(`/posts/${postId}/like`);
    return data.data;
  },

  async savePost(postId: string): Promise<{ saved: boolean; postId: string }> {
    const { data } = await apiClient.post(`/posts/${postId}/save`);
    return data.data;
  },

  async unsavePost(postId: string): Promise<{ saved: boolean; postId: string }> {
    const { data } = await apiClient.delete(`/posts/${postId}/save`);
    return data.data;
  },

  async getComments(postId: string): Promise<CommentItem[]> {
    const { data } = await apiClient.get(`/posts/${postId}/comments`);
    return data.data;
  },

  async createComment(
    postId: string,
    payload: { content: string; parentCommentId?: string },
  ): Promise<CommentItem> {
    const { data } = await apiClient.post(`/posts/${postId}/comments`, payload);
    return data.data;
  },

  async updateComment(
    commentId: string,
    payload: { content: string },
  ): Promise<CommentItem> {
    const { data } = await apiClient.patch(
      `/posts/comments/${commentId}`,
      payload,
    );
    return data.data;
  },

  async deleteComment(
    commentId: string,
  ): Promise<{ deleted: boolean; commentId: string; deletedCount: number }> {
    const { data } = await apiClient.delete(`/posts/comments/${commentId}`);
    return data.data;
  },

  async getTrendingHashtags(): Promise<TrendingHashtag[]> {
    const { data } = await apiClient.get('/posts/hashtags/trending');
    return data.data;
  },

  async uploadMedia(files: File[]): Promise<UploadedMediaItem[]> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    const { data } = await apiClient.post('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data.data;
  },

  async getPublicProfile(identifier: string): Promise<PublicUserProfile> {
    const { data } = await apiClient.get(`/users/${identifier}`);
    return data.data;
  },

  async getSuggestedUsers(): Promise<UserConnectionItem[]> {
    const { data } = await apiClient.get('/users/suggested');
    return data.data;
  },

  async followUser(
    targetUserId: string,
  ): Promise<{ isFollowing: boolean; targetUserId: string; followersCount: number }> {
    const { data } = await apiClient.post(`/users/${targetUserId}/follow`);
    return data.data;
  },

  async unfollowUser(
    targetUserId: string,
  ): Promise<{ isFollowing: boolean; targetUserId: string; followersCount: number }> {
    const { data } = await apiClient.delete(`/users/${targetUserId}/follow`);
    return data.data;
  },

  async getFollowers(targetUserId: string): Promise<UserConnectionItem[]> {
    const { data } = await apiClient.get(`/users/${targetUserId}/followers`);
    return data.data;
  },

  async getFollowing(targetUserId: string): Promise<UserConnectionItem[]> {
    const { data } = await apiClient.get(`/users/${targetUserId}/following`);
    return data.data;
  },
};
