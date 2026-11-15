import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Calendar,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  PackageCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { socketService } from '../services/socket.service';
import { NotificationItem, NotificationType } from '../types';
import { Badge, Button, Card } from '../components/ui/DesignSystem';
import { formatRelativeTime } from '../utils/format';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'BOOKING_REQUEST':
      return {
        icon: <Calendar size={18} />,
        bg: 'bg-amber-100 text-amber-700',
        badge: 'Yêu cầu mới',
        variant: 'amber' as const,
      };
    case 'BOOKING_APPROVED':
      return {
        icon: <CheckCircle2 size={18} />,
        bg: 'bg-emerald-100 text-emerald-700',
        badge: 'Đã duyệt',
        variant: 'emerald' as const,
      };
    case 'BOOKING_REJECTED':
    case 'BOOKING_CANCELLED':
      return {
        icon: <XCircle size={18} />,
        bg: 'bg-rose-100 text-rose-700',
        badge: type === 'BOOKING_REJECTED' ? 'Từ chối' : 'Đã hủy',
        variant: 'red' as const,
      };
    case 'BOOKING_HANDED_OVER':
    case 'BOOKING_RETURN_PENDING':
      return {
        icon: <PackageCheck size={18} />,
        bg: 'bg-blue-100 text-blue-700',
        badge:
          type === 'BOOKING_HANDED_OVER'
            ? 'Bàn giao thiết bị'
            : 'Chờ xác nhận trả đồ',
        variant: 'blue' as const,
      };
    case 'BOOKING_COMPLETED':
      return {
        icon: <Sparkles size={18} />,
        bg: 'bg-emerald-100 text-emerald-700',
        badge: 'Hoàn tất giao dịch',
        variant: 'emerald' as const,
      };
    default:
      return {
        icon: <Bell size={18} />,
        bg: 'bg-slate-100 text-slate-700',
        badge: 'Thông báo',
        variant: 'slate' as const,
      };
  }
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { unreadOnly }],
    queryFn: () =>
      notificationService.getNotifications({
        page: 1,
        limit: 50,
        unreadOnly,
      }),
  });

  useEffect(() => {
    socketService.connect();

    const unsubNotif = socketService.onNewNotification(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    });

    const unsubReconnect = socketService.onReconnect(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    });

    return () => {
      unsubNotif();
      unsubReconnect();
    };
  }, [queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await markReadMutation.mutateAsync(item.id);
      } catch {
        // continue navigation even if markAsRead fails
      }
    }
    navigate(item.targetUrl || '/bookings');
  };

  const notifications = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <Card className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Bell size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">
                Trung tâm thông báo
              </h1>
              {unreadCount > 0 && (
                <Badge variant="red">{unreadCount} chưa đọc</Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Cập nhật tức thì trạng thái đơn thuê, xác nhận bàn giao (Handover)
              và hoàn tất giao dịch.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !unreadOnly
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setUnreadOnly(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                unreadOnly
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chưa đọc ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="flex items-center gap-1.5"
            >
              <CheckCheck size={15} />
              <span>Đọc tất cả</span>
            </Button>
          )}
        </div>
      </Card>

      {/* Notification List */}
      <Card className="overflow-hidden divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 size={26} className="animate-spin text-emerald-600" />
            <span className="text-xs">Đang tải danh sách thông báo...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Bell size={26} />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {unreadOnly
                ? 'Bạn đã đọc hết tất cả thông báo!'
                : 'Chưa có thông báo giao dịch nào'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Khi có yêu cầu thuê mới, duyệt đơn, xác nhận bàn giao hoặc hoàn trả
              thiết bị, thông báo sẽ hiển thị trực tiếp tại đây.
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const meta = getNotificationIcon(item.type);

            return (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleNotificationClick(item);
                  }
                }}
                className={`p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                  !item.isRead
                    ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}
                  >
                    {meta.icon}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant}>{meta.badge}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                      {!item.isRead && (
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                      )}
                    </div>

                    <h3
                      className={`text-sm sm:text-base ${
                        !item.isRead
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-700'
                      }`}
                    >
                      {item.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-center">
                  <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    Chi tiết
                    <ExternalLink size={13} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
};
