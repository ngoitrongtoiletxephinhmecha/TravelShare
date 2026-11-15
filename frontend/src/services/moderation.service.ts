import { apiClient } from './api';
import { UserRole } from '../types';

export type ReportTargetType =
  | 'POST'
  | 'COMMENT'
  | 'GEAR'
  | 'USER'
  | 'BOOKING';

export type ReportStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED_RENTER'
  | 'RESOLVED_OWNER'
  | 'CLOSED';

export interface MyReportItem {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  description?: string;
  status: ReportStatus;
  publicOutcome?: string;
  actionTaken?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationReportItem extends MyReportItem {
  communityId?: string | null;
  internalNote?: string;
  reporter?: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl?: string;
  } | null;
  targetPreview?: {
    label: string;
    subtitle?: string;
    isHidden?: boolean;
  } | null;
}

export interface AdminOverviewData {
  usersTotal: number;
  usersSuspended: number;
  communitiesTotal: number;
  postsTotal: number;
  postsHidden: number;
  gearTotal: number;
  gearHidden: number;
  reportsPending: number;
  disputesOpen: number;
}

export interface AdminUserItem {
  id: string;
  username: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  status: AccountStatus;
  trustScore: number;
  createdAt: string;
}

export interface AdminContentItem {
  id: string;
  type: 'POST' | 'COMMENT' | 'GEAR';
  titleOrExcerpt: string;
  authorName: string;
  isHidden: boolean;
  hiddenReason?: string;
  moderationStatus?: string;
  createdAt: string;
}

export interface AdminDisputeItem {
  id: string;
  bookingId: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  adminNotes?: string;
  evidenceUrls?: string[];
  reporter?: {
    id: string;
    username: string;
    fullName: string;
  } | null;
  booking?: {
    id: string;
    bookingCode: string;
    status: string;
    gearTitle?: string;
  } | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  createdAt: string;
}

export const moderationService = {
  async submitReport(payload: {
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    description?: string;
  }): Promise<MyReportItem> {
    const { data } = await apiClient.post('/reports', payload);
    return data.data;
  },

  async getMyReports(params?: {
    page?: number;
    limit?: number;
  }): Promise<{
    items: MyReportItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/reports/my', { params });
    return data.data;
  },

  async getModerationQueue(params?: {
    targetType?: ReportTargetType;
    status?: ReportStatus;
    communityId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: ModerationReportItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/reports/moderation', { params });
    return data.data;
  },

  async handleReport(
    reportId: string,
    payload: {
      status: ReportStatus;
      action?: 'NONE' | 'HIDE_CONTENT' | 'RESTORE_CONTENT' | 'SUSPEND_USER';
      publicOutcome?: string;
      internalNote?: string;
    },
  ): Promise<ModerationReportItem> {
    const { data } = await apiClient.patch(`/reports/${reportId}/handle`, payload);
    return data.data;
  },

  async getAdminOverview(): Promise<AdminOverviewData> {
    const { data } = await apiClient.get('/admin/overview');
    return data.data;
  },

  async getAdminUsers(params?: {
    q?: string;
    status?: AccountStatus;
    role?: UserRole;
    page?: number;
    limit?: number;
  }): Promise<{
    items: AdminUserItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/admin/users', { params });
    return data.data;
  },

  async updateUserStatus(
    userId: string,
    payload: { status: AccountStatus; reason: string },
  ): Promise<AdminUserItem> {
    const { data } = await apiClient.patch(`/admin/users/${userId}/status`, payload);
    return data.data;
  },

  async getAdminContent(params: {
    type: 'POST' | 'COMMENT' | 'GEAR';
    q?: string;
    visibility?: 'ALL' | 'VISIBLE' | 'HIDDEN';
    page?: number;
    limit?: number;
  }): Promise<{
    items: AdminContentItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/admin/content', { params });
    return data.data;
  },

  async moderateContent(
    targetType: 'POST' | 'COMMENT' | 'GEAR',
    targetId: string,
    payload: { action: 'HIDE' | 'RESTORE'; reason: string },
  ): Promise<{ id: string; isHidden: boolean }> {
    const { data } = await apiClient.patch(
      `/admin/content/${targetType}/${targetId}`,
      payload,
    );
    return data.data;
  },

  async getAdminDisputes(): Promise<AdminDisputeItem[]> {
    const { data } = await apiClient.get('/admin/disputes');
    return data.data;
  },

  async resolveDispute(
    disputeId: string,
    payload: { status: DisputeStatus; adminNotes: string },
  ): Promise<AdminDisputeItem> {
    const { data } = await apiClient.patch(`/admin/disputes/${disputeId}`, payload);
    return data.data;
  },

  async getAuditLogs(params?: {
    page?: number;
    limit?: number;
  }): Promise<{
    items: AuditLogItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/admin/audit-logs', { params });
    return data.data;
  },
};
