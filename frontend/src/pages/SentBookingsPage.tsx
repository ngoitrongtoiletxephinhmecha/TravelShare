import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  MapPin,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { bookingService } from '../services/booking.service';
import { BookingItem, BookingStatus } from '../types';
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';
import { BookingStatusBadge } from '../components/booking/BookingComponents';
import { formatVietnamDate, formatVnd } from '../utils/format';

const STATUS_TABS: { value: BookingStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Đang chờ duyệt' },
  { value: 'APPROVED', label: 'Chờ nhận đồ' },
  { value: 'IN_USE', label: 'Đang sử dụng' },
  { value: 'RETURN_PENDING', label: 'Chờ xác nhận trả' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export const SentBookingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus | 'ALL'>(
    'ALL',
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bookings-sent', selectedStatus],
    queryFn: () =>
      bookingService.getSentBookings({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        limit: 30,
      }),
  });

  const bookings: BookingItem[] = data?.items || [];

  const handleCancel = async (bookingId: string) => {
    const reason = window.prompt(
      'Nhập lý do hủy yêu cầu thuê/mượn thiết bị:',
      'Đoàn thay đổi lịch trình chuyến đi nên xin phép hủy lịch.',
    );
    if (!reason || !reason.trim()) return;

    setActionError(null);
    setBusyId(bookingId);
    try {
      await bookingService.cancelBooking(bookingId, reason.trim());
      queryClient.invalidateQueries({ queryKey: ['bookings-sent'] });
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Hủy yêu cầu không thành công.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Đơn Thuê & Mượn Đã Gửi (Người thuê)
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Theo dõi trạng thái phê duyệt, xác nhận nhận thiết bị (Handover),
            hoàn trả và đánh giá sau chuyến đi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/bookings/received">
            <Button variant="outline" size="sm">
              Yêu cầu gửi đến kho đồ của tôi →
            </Button>
          </Link>
          <Link to="/gear">
            <Button variant="primary" size="sm">
              Khám phá thêm thiết bị
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedStatus(tab.value)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              selectedStatus === tab.value
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="p-5">
              <Skeleton className="h-24 w-full rounded-xl" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center text-xs text-red-700">
          Không thể tải danh sách đơn thuê đã gửi.
        </Card>
      ) : bookings.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Send className="w-6 h-6" />}
            title="Bạn chưa gửi yêu cầu thuê/mượn nào"
            description="Hãy khám phá các thiết bị cắm trại, trekking trên Marketplace và chọn ngày cho hành trình tiếp theo."
            action={
              <Link to="/gear">
                <Button variant="primary" size="sm">
                  Tới trang Thuê & Mượn đồ
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const snap = b.pickupLocationSnapshot;
            const thumb =
              snap.images?.[0] ||
              'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80';
            const canCancel =
              b.status === 'PENDING' || b.status === 'APPROVED';

            return (
              <Card
                key={b.id}
                className="p-4 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                  {/* Left: Gear & Owner Info */}
                  <div className="flex gap-4 min-w-0">
                    <Link to={`/bookings/${b.id}`} className="shrink-0">
                      <img
                        src={thumb}
                        alt={snap.gearTitle}
                        className="w-24 h-24 rounded-xl object-cover border border-stone-200"
                      />
                    </Link>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BookingStatusBadge status={b.status} />
                        <span className="text-[11px] text-stone-400 font-mono">
                          #{b.id.slice(-6).toUpperCase()}
                        </span>
                      </div>

                      <Link
                        to={`/bookings/${b.id}`}
                        className="block text-sm sm:text-base font-bold text-stone-900 hover:text-emerald-700 truncate"
                      >
                        {snap.gearTitle}
                      </Link>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatVietnamDate(b.startAt)} →{' '}
                          {formatVietnamDate(b.endAt)} ({b.rentalDays} ngày • SL:{' '}
                          {b.quantity})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-stone-400" />
                          Nhận đồ tại: {snap.district}, {snap.city}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <span className="text-stone-500">Chủ thiết bị:</span>
                        <Link
                          to={`/users/${b.owner.username}`}
                          className="font-semibold text-stone-900 hover:text-emerald-700 inline-flex items-center gap-1"
                        >
                          {b.owner.fullName} (@{b.owner.username})
                          <span className="inline-flex items-center text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {b.owner.trustScore}★
                          </span>
                        </Link>
                      </div>

                      {b.ownerResponseNote && (
                        <p className="text-xs text-emerald-900 bg-emerald-50/70 px-3 py-1.5 rounded-lg border border-emerald-200/70">
                          Phản hồi từ chủ đồ: “{b.ownerResponseNote}”
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Pricing & Renter Quick Actions */}
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-stone-100 shrink-0">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-stone-500">Tổng phí thuê:</p>
                      <p className="text-base font-bold text-emerald-800">
                        {b.rentalTotal === 0
                          ? 'Miễn phí (0 ₫)'
                          : formatVnd(b.rentalTotal)}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Tiền cọc: {formatVnd(b.depositAmount)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {canCancel && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          isLoading={busyId === b.id}
                          onClick={() => handleCancel(b.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Hủy yêu cầu
                        </Button>
                      )}

                      <Link to={`/bookings/${b.id}`}>
                        <Button variant="primary" size="sm">
                          Theo dõi & Bàn giao
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
