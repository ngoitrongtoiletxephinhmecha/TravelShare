import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Inbox,
  MapPin,
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
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Chờ bàn giao' },
  { value: 'IN_USE', label: 'Đang cho thuê' },
  { value: 'RETURN_PENDING', label: 'Chờ xác nhận trả' },
  { value: 'COMPLETED', label: 'Đã hoàn tất' },
  { value: 'DISPUTED', label: 'Tranh chấp' },
];

export const ReceivedBookingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus | 'ALL'>(
    'ALL',
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bookings-received', selectedStatus],
    queryFn: () =>
      bookingService.getReceivedBookings({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        limit: 30,
      }),
  });

  const bookings: BookingItem[] = data?.items || [];

  const handleApprove = async (bookingId: string) => {
    const note = window.prompt(
      'Ghi chú cho người thuê khi duyệt (Không bắt buộc):',
      'Đã duyệt! Bạn liên hệ nhận thiết bị đúng giờ nhé.',
    );
    if (note === null) return;

    setActionError(null);
    setBusyId(bookingId);
    try {
      await bookingService.approveBooking(bookingId, note);
      queryClient.invalidateQueries({ queryKey: ['bookings-received'] });
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể duyệt yêu cầu. Có thể thiết bị đã bị trùng lịch.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (bookingId: string) => {
    const reason = window.prompt(
      'Nhập lý do từ chối yêu cầu thuê:',
      'Lịch trình cá nhân thay đổi nên chưa thể giao thiết bị đợt này.',
    );
    if (reason === null) return;

    setActionError(null);
    setBusyId(bookingId);
    try {
      await bookingService.rejectBooking(bookingId, reason);
      queryClient.invalidateQueries({ queryKey: ['bookings-received'] });
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Từ chối yêu cầu không thành công.';
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
            Quản lý Yêu cầu Thuê nhận được (Chủ thiết bị)
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Duyệt yêu cầu mượn/thuê, kiểm tra lịch bàn giao và xác nhận hoàn trả
            thiết bị.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/bookings/sent">
            <Button variant="outline" size="sm">
              Xem đơn tôi đi thuê →
            </Button>
          </Link>
          <Link to="/my-gear">
            <Button variant="secondary" size="sm">
              Kho thiết bị của tôi
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
          Không thể tải danh sách yêu cầu thuê nhận được.
        </Card>
      ) : bookings.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Inbox className="w-6 h-6" />}
            title="Chưa có yêu cầu thuê/mượn nào"
            description="Khi thành viên khác đặt thuê thiết bị của bạn trên Marketplace, yêu cầu sẽ hiển thị tại đây."
            action={
              <Link to="/gear/create">
                <Button variant="primary" size="sm">
                  Đăng thêm thiết bị chia sẻ
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

            return (
              <Card
                key={b.id}
                className="p-4 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                  {/* Left: Gear & Renter Info */}
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
                          {snap.district}, {snap.city}
                        </span>
                      </div>

                      {/* Renter Badge */}
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <span className="text-stone-500">Người hỏi thuê:</span>
                        <Link
                          to={`/users/${b.renter.username}`}
                          className="font-semibold text-stone-900 hover:text-emerald-700 inline-flex items-center gap-1"
                        >
                          {b.renter.fullName} (@{b.renter.username})
                          <span className="inline-flex items-center text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {b.renter.trustScore}★
                          </span>
                        </Link>
                      </div>

                      {b.renterNote && (
                        <p className="text-xs text-stone-600 italic bg-stone-50 px-3 py-1.5 rounded-lg border border-stone-200/60">
                          “{b.renterNote}”
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Pricing & Owner Quick Actions */}
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
                      {b.status === 'PENDING' && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            isLoading={busyId === b.id}
                            onClick={() => handleApprove(b.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Duyệt đơn
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            isLoading={busyId === b.id}
                            onClick={() => handleReject(b.id)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Từ chối
                          </Button>
                        </>
                      )}

                      <Link to={`/bookings/${b.id}`}>
                        <Button variant="outline" size="sm">
                          Chi tiết & Bàn giao
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
