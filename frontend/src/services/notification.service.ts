import { apiClient } from './api';
import {
  NotificationItem,
  NotificationType,
  PaginatedNotificationsResult,
} from '../types';

export function normalizeNotification(raw: any): NotificationItem {
  return {
    id: String(raw.id || raw._id || ''),
    recipientId: String(raw.recipientId || ''),
    actorId: raw.actorId ? String(raw.actorId) : undefined,
    actor: raw.actor
      ? {
          id: String(raw.actor.id || raw.actor.userId || raw.actor._id || ''),
          username: raw.actor.username || 'member',
          fullName: raw.actor.fullName || 'Thành viên TravelShare',
          avatarUrl: raw.actor.avatarUrl || '',
        }
      : null,
    type: (raw.type || 'SYSTEM_ALERT') as NotificationType,
    bookingId: raw.bookingId ? String(raw.bookingId) : undefined,
    gearId: raw.gearId ? String(raw.gearId) : undefined,
    title: raw.title || 'Thông báo mới',
    body: raw.body || raw.content || '',
    targetUrl: raw.targetUrl || '/bookings',
    isRead: Boolean(raw.isRead),
    readAt: raw.readAt || undefined,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

export const notificationService = {
  async getNotifications(params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<PaginatedNotificationsResult> {
    const query: Record<string, any> = {};
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.unreadOnly) query.unreadOnly = 'true';

    const { data } = await apiClient.get('/notifications', { params: query });
    const raw = data.data || {};
    const items = Array.isArray(raw.items)
      ? raw.items.map(normalizeNotification)
      : [];
    const total = Number(raw.total || items.length);
    const limit = Number(raw.limit || params?.limit || 25);

    return {
      items,
      unreadCount: Number(raw.unreadCount || 0),
      total,
      page: Number(raw.page || params?.page || 1),
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getUnreadCount(): Promise<{ unreadCount: number }> {
    const { data } = await apiClient.get('/notifications/unread-count');
    return {
      unreadCount: Number(data.data?.unreadCount || 0),
    };
  },

  async markAsRead(id: string): Promise<{
    notification: NotificationItem;
    unreadCount: number;
  }> {
    const { data } = await apiClient.patch(`/notifications/${id}/read`);
    const raw = data.data || {};
    return {
      notification: normalizeNotification(raw.notification || raw),
      unreadCount: Number(raw.unreadCount || 0),
    };
  },

  async markAllAsRead(): Promise<{ markedCount: number; unreadCount: number }> {
    const { data } = await apiClient.post('/notifications/read-all');
    const raw = data.data || {};
    return {
      markedCount: Number(raw.markedCount || 0),
      unreadCount: Number(raw.unreadCount || 0),
    };
  },
};
