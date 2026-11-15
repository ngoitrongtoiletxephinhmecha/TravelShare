import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Star,
  XCircle,
} from 'lucide-react';
import { bookingService } from '../services/booking.service';
import { chatService } from '../services/chat.service';
import { useAuthStore } from '../store/auth.store';
import { DisputeStatus } from '../types';
import {
  Badge,
  Button,
  Card,
  Skeleton,
} from '../components/ui/DesignSystem';
import {
  BookingStatusBadge,
  BookingSummary,
  BookingTimeline,
} from '../components/booking/BookingComponents';
import {
  DisputeForm,
  HandoverForm,
  ReturnConfirmation,
  ReviewModal,
} from '../components/booking/BookingModals';
import { formatVietnamDateTime } from '../utils/format';

export const BookingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [busyAction, setBusyAction] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const {
    data: booking,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['booking-detail', id],
    queryFn: () => bookingService.getBookingById(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-stone-900">
            Không tìm thấy thông tin giao dịch
          </h2>
          <p className="text-xs text-stone-500">
            Giao dịch không tồn tại hoặc bạn không phải là thành viên tham gia
            đơn thuê này.
          </p>
          <Link to="/bookings/sent">
            <Button variant="primary" size="sm">
              Quay lại danh sách đơn thuê
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const currentUserId = user?.id || '';
  const isOwner = String(booking.ownerId) === String(currentUserId);
  const isRenter = String(booking.renterId) === String(currentUserId);
  const isAdmin = user?.role === 'ADMIN';

  const pickupHandover = booking.handovers.find(
    (h) => h.handoverType === 'PICKUP',
  );
  const returnHandover = booking.handovers.find(
    (h) => h.handoverType === 'RETURN',
  );

  const handleApprove = async () => {
    const note = window.prompt(
      'Lời nhắn cho người thuê khi chấp nhận (không bắt buộc):',
      'Đã duyệt! Hẹn gặp bạn bàn giao thiết bị đúng giờ nhé.',
    );
    if (note === null) return;

    setActionError(null);
    setBusyAction(true);
    try {
      await bookingService.approveBooking(booking.id, note);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['bookings-received'] });
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể duyệt giao dịch (có thể trùng lịch với đơn khác).';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyAction(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt(
      'Nhập lý do từ chối yêu cầu thuê:',
      'Thiết bị đang bảo dưỡng định kỳ nên chưa thể cho thuê.',
    );
    if (reason === null) return;

    setActionError(null);
    setBusyAction(true);
    try {
      await bookingService.rejectBooking(booking.id, reason);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['bookings-received'] });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Từ chối không thành công.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyAction(false);
    }
  };

  const handleCancel = async () => {
    const reason = window.prompt(
      'Nhập lý do hủy giao dịch:',
      'Thay đổi kế hoạch chuyến đi.',
    );
    if (!reason || !reason.trim()) return;

    setActionError(null);
    setBusyAction(true);
    try {
      await bookingService.cancelBooking(booking.id, reason.trim());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['bookings-sent'] });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Hủy giao dịch thất bại.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyAction(false);
    }
  };

  const handleAdminResolveDispute = async (
    disputeId: string,
    status: DisputeStatus,
  ) => {
    const adminNotes = window.prompt(
      'Nhập quyết định xử lý của Admin:',
      'Đã đối chiếu ảnh Handover hai bên và thống nhất phương án xử lý.',
    );
    if (!adminNotes || !adminNotes.trim()) return;

    setActionError(null);
    setBusyAction(true);
    try {
      await bookingService.resolveDispute(disputeId, {
        status,
        adminNotes: adminNotes.trim(),
      });
      await refetch();
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Cập nhật tranh chấp thất bại.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBusyAction(false);
    }
  };

  const snap = booking.pickupLocationSnapshot;
  const thumb =
    snap.images?.[0] ||
    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80';

  const handleOpenBookingChat = async () => {
    const partnerId = isOwner ? booking.renterId : booking.ownerId;
    setActionError(null);
    setOpeningChat(true);
    try {
      const conv = await chatService.openConversation({
        targetUserId: partnerId,
        bookingId: booking.id,
      });
      navigate(`/messages/${conv.id}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Không thể mở cuộc hội thoại cho giao dịch này.';
      setActionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={isOwner ? '/bookings/received' : '/bookings/sent'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách giao dịch
        </Link>
        <span className="text-xs font-mono text-stone-500">
          Mã giao dịch: #{booking.id.toUpperCase()}
        </span>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Header Card */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-4">
            <Link to={`/gear/${booking.gearId}`} className="shrink-0">
              <img
                src={thumb}
                alt={snap.gearTitle}
                className="w-24 h-24 rounded-2xl object-cover border border-stone-200"
              />
            </Link>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <BookingStatusBadge status={booking.status} />
                <Badge variant="stone">
                  Tình trạng gốc: {snap.condition}
                </Badge>
              </div>
              <Link
                to={`/gear/${booking.gearId}`}
                className="block text-base sm:text-lg font-bold text-stone-900 hover:text-emerald-700"
              >
                {snap.gearTitle}
              </Link>
              <p className="text-xs text-stone-600 inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                Khu vực giao nhận: {snap.district}, {snap.city}
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start">
            {(isOwner || isRenter) && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={openingChat}
                onClick={handleOpenBookingChat}
              >
                <MessageSquare className="w-4 h-4" />
                Trao đổi về giao dịch
              </Button>
            )}

            {isOwner && booking.status === 'PENDING' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={busyAction}
                  onClick={handleApprove}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Chấp nhận cho thuê
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={busyAction}
                  onClick={handleReject}
                >
                  <XCircle className="w-4 h-4" />
                  Từ chối
                </Button>
              </>
            )}

            {(booking.status === 'PENDING' ||
              booking.status === 'APPROVED') && (
              <Button
                variant="outline"
                size="sm"
                isLoading={busyAction}
                onClick={handleCancel}
              >
                <XCircle className="w-4 h-4 text-red-600" />
                Hủy giao dịch
              </Button>
            )}

            {booking.status === 'COMPLETED' &&
              (isOwner || isRenter) &&
              !booking.hasViewerReviewed && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setReviewModalOpen(true)}
                >
                  <Star className="w-4 h-4" />
                  Đánh giá đối tác (1-5★)
                </Button>
              )}
          </div>
        </div>

        {/* Participant Cards & Pricing Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-stone-100">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-400">
                Chủ thiết bị (Owner)
              </span>
              <Link
                to={`/users/${booking.owner.username}`}
                className="block font-bold text-stone-900 hover:text-emerald-700 truncate"
              >
                {booking.owner.fullName}
              </Link>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Uy tín {booking.owner.trustScore}★
              </span>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-400">
                Người thuê (Renter)
              </span>
              <Link
                to={`/users/${booking.renter.username}`}
                className="block font-bold text-stone-900 hover:text-emerald-700 truncate"
              >
                {booking.renter.fullName}
              </Link>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Uy tín {booking.renter.trustScore}★
              </span>
            </div>

            {snap.usageRules && snap.usageRules.length > 0 && (
              <div className="col-span-2 p-3 rounded-xl bg-amber-50/50 border border-amber-200/70 text-xs">
                <p className="font-semibold text-amber-900 mb-1">
                  Quy định bảo quản tại thời điểm đặt (Snapshot):
                </p>
                <ul className="list-disc list-inside text-stone-700 space-y-0.5">
                  {snap.usageRules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <BookingSummary
            sharingType={booking.sharingType}
            pricePerDay={booking.priceSnapshot}
            depositAmount={
              booking.quantity > 0
                ? booking.depositAmount / booking.quantity
                : booking.depositAmount
            }
            rentalDays={booking.rentalDays}
            quantity={booking.quantity}
            startAt={booking.startAt}
            endAt={booking.endAt}
          />
        </div>
      </Card>

      {/* Workflow Timeline & Audit Log */}
      <BookingTimeline
        status={booking.status}
        statusHistory={booking.statusHistory}
      />

      {/* Handover Section 1: PICKUP */}
      {(booking.status === 'APPROVED' ||
        booking.status === 'IN_USE' ||
        booking.status === 'RETURN_PENDING' ||
        booking.status === 'COMPLETED' ||
        pickupHandover) && (
        <HandoverForm
          booking={booking}
          currentUserId={currentUserId}
          handoverRecord={pickupHandover}
          mode="PICKUP"
          onUpdated={() => refetch()}
        />
      )}

      {/* Handover Section 2: RETURN */}
      {(booking.status === 'IN_USE' ||
        booking.status === 'RETURN_PENDING' ||
        booking.status === 'COMPLETED' ||
        returnHandover) && (
        <ReturnConfirmation
          booking={booking}
          currentUserId={currentUserId}
          handoverRecord={returnHandover}
          mode="RETURN"
          onUpdated={() => refetch()}
        />
      )}

      {/* Reviews Section (after COMPLETED) */}
      {booking.reviews && booking.reviews.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            Đánh giá từ hai bên sau giao dịch ({booking.reviews.length}/2)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {booking.reviews.map((rev) => (
              <div
                key={rev.id}
                className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="emerald">
                    {rev.reviewerRole === 'RENTER'
                      ? 'Người thuê đánh giá'
                      : 'Chủ thiết bị đánh giá'}
                  </Badge>
                  <span className="font-bold text-amber-600">
                    {'★'.repeat(rev.rating)} ({rev.rating}/5)
                  </span>
                </div>
                <p className="text-stone-800">{rev.comment}</p>
                <p className="text-[10px] text-stone-400">
                  {formatVietnamDateTime(rev.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Disputes Section */}
      {booking.disputes && booking.disputes.length > 0 && (
        <Card className="p-5 border-red-200 bg-red-50/20 space-y-3">
          <h3 className="text-sm font-bold text-red-900 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-700" />
            Hồ sơ Khiếu nại / Tranh chấp ({booking.disputes.length})
          </h3>
          {booking.disputes.map((d) => (
            <div
              key={d.id}
              className="p-3.5 rounded-xl bg-white border border-red-200 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-800">
                  Lý do: {d.reason}
                </span>
                <Badge variant="red">{d.status}</Badge>
              </div>
              <p className="text-stone-800">{d.description}</p>
              {d.adminNotes && (
                <p className="p-2 rounded-lg bg-emerald-50 text-emerald-900 font-medium">
                  Quyết định của Admin: {d.adminNotes}
                </p>
              )}

              {isAdmin && d.status === 'OPEN' && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      handleAdminResolveDispute(d.id, 'RESOLVED_FOR_OWNER')
                    }
                  >
                    Xử lý bảo vệ Chủ đồ
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      handleAdminResolveDispute(d.id, 'RESOLVED_FOR_RENTER')
                    }
                  >
                    Xử lý bảo vệ Người thuê
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Button to open DisputeForm if active */}
      {(booking.status === 'APPROVED' ||
        booking.status === 'IN_USE' ||
        booking.status === 'RETURN_PENDING') &&
        (isOwner || isRenter) && (
          <DisputeForm bookingId={booking.id} onSuccess={() => refetch()} />
        )}

      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        bookingId={booking.id}
        targetName={
          isRenter ? booking.owner.fullName : booking.renter.fullName
        }
        onSuccess={() => refetch()}
      />
    </div>
  );
};
