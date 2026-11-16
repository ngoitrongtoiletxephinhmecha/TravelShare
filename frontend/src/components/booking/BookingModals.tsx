import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  BookingDetailData,
  DisputeReason,
  GearCondition,
  GearDetailData,
  HandoverRecord,
} from '../../types';
import { bookingService } from '../../services/booking.service';
import { socialService } from '../../services/social.service';
import { Badge, Button, Card } from '../ui/DesignSystem';
import { AuthorizedMediaImage } from './AuthorizedMediaImage';
import {
  BookingDateRangePicker,
  BookingSummary,
} from './BookingComponents';
import { formatVietnamDateTime } from '../../utils/format';

const CONDITION_OPTIONS: { value: GearCondition; label: string }[] = [
  { value: 'NEW', label: 'Mới 100% (NEW)' },
  { value: 'LIKE_NEW', label: 'Như mới 95-99% (LIKE_NEW)' },
  { value: 'GOOD', label: 'Hoạt động tốt (GOOD)' },
  { value: 'FAIR', label: 'Khá / Có vết xước nhẹ (FAIR)' },
];

const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'DAMAGED_GEAR', label: 'Thiết bị hư hỏng / thiếu phụ kiện' },
  { value: 'LATE_RETURN', label: 'Trả thiết bị muộn so với lịch hẹn' },
  { value: 'NO_SHOW_DELIVERY', label: 'Không giao thiết bị đúng hẹn' },
  { value: 'MISREPRESENTED_GEAR', label: 'Thiết bị sai khác so với mô tả' },
  { value: 'OTHER', label: 'Khiếu nại / Tranh chấp khác' },
];

export const BookingRequestModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  gear: GearDetailData;
  initialStartDate?: string;
  initialEndDate?: string;
  initialQuantity?: number;
  expectedPricePerDay?: number;
  expectedDepositAmount?: number;
  expectedSharingType?: 'RENT' | 'FREE_LOAN' | 'BOTH';
}> = ({
  isOpen,
  onClose,
  gear,
  initialStartDate = '',
  initialEndDate = '',
  initialQuantity = 1,
  expectedPricePerDay,
  expectedDepositAmount,
  expectedSharingType,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [renterNote, setRenterNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (initialStartDate) setStartDate(initialStartDate);
      if (initialEndDate) setEndDate(initialEndDate);
      setQuantity(initialQuantity || 1);
      setError(null);
    }
  }, [isOpen, initialStartDate, initialEndDate, initialQuantity]);

  if (!isOpen) return null;

  const rentalDays = (() => {
    if (!startDate || !endDate) return 1;
    const s = new Date(`${startDate}T00:00:00.000Z`);
    const e = new Date(`${endDate}T00:00:00.000Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) return 0;
    return Math.max(
      1,
      Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)),
    );
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Vui lòng chọn ngày nhận và ngày trả thiết bị.');
      return;
    }

    const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${endDate}T00:00:00.000Z`).toISOString();

    if (new Date(startIso) >= new Date(endIso)) {
      setError(
        'Khoảng ngày không hợp lệ: Ngày nhận (startAt) phải trước ngày trả (endAt).',
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const created = await bookingService.createBooking({
        gearId: gear.id,
        startAt: startIso,
        endAt: endIso,
        quantity,
        renterNote: renterNote.trim() || undefined,
        ...(expectedPricePerDay !== undefined ? { expectedPricePerDay } : {}),
        ...(expectedDepositAmount !== undefined
          ? { expectedDepositAmount }
          : {}),
        ...(expectedSharingType ? { expectedSharingType } : {}),
      });

      queryClient.invalidateQueries({ queryKey: ['bookings-sent'] });
      queryClient.invalidateQueries({ queryKey: ['gear-detail', gear.id] });
      onClose();
      navigate(`/bookings/${created.id}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể tạo yêu cầu thuê thiết bị. Vui lòng kiểm tra lại khoảng ngày.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Gửi yêu cầu thuê / mượn thiết bị
            </h2>
            <p className="text-xs text-stone-500 truncate max-w-xs sm:max-w-sm">
              {gear.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <BookingDateRangePicker
            startDate={startDate}
            endDate={endDate}
            quantity={quantity}
            maxQuantity={gear.totalQuantity}
            minRentalDays={gear.availabilitySettings?.minRentalDays}
            maxRentalDays={gear.availabilitySettings?.maxRentalDays}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onQuantityChange={setQuantity}
          />

          <BookingSummary
            sharingType={gear.sharingType}
            pricePerDay={gear.pricePerDay}
            depositAmount={gear.depositAmount}
            rentalDays={rentalDays}
            quantity={quantity}
            startAt={startDate ? `${startDate}T00:00:00.000Z` : undefined}
            endAt={endDate ? `${endDate}T00:00:00.000Z` : undefined}
          />

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Lời nhắn gửi chủ thiết bị ({gear.owner.fullName})
            </label>
            <textarea
              rows={3}
              value={renterNote}
              onChange={(e) => setRenterNote(e.target.value)}
              placeholder="Giới thiệu cung đường sắp đi, thời gian dự kiến ghé nhận đồ và cam kết bảo quản thiết bị..."
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              disabled={rentalDays <= 0}
            >
              Xác nhận gửi yêu cầu
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const HandoverForm: React.FC<{
  booking: BookingDetailData;
  currentUserId: string;
  handoverRecord?: HandoverRecord;
  mode: 'PICKUP' | 'RETURN';
  onUpdated: (updated: BookingDetailData) => void;
}> = ({ booking, currentUserId, handoverRecord, mode, onUpdated }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [condition, setCondition] = useState<GearCondition>(
    booking.pickupLocationSnapshot.condition || 'GOOD',
  );
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmations = handoverRecord?.confirmations || [];
  const ownerConfirmation = confirmations.find((c) => c.role === 'OWNER');
  const renterConfirmation = confirmations.find((c) => c.role === 'RENTER');
  const hasCurrentUserConfirmed = confirmations.some(
    (c) => String(c.userId) === String(currentUserId),
  );

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setUploading(true);
    try {
      const uploaded = await socialService.uploadMedia(files, {
        scope: 'BOOKING_HANDOVER',
        bookingId: booking.id,
      });
      setPhotos((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể tải ảnh tình trạng thiết bị. Vui lòng thử lại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated =
        mode === 'PICKUP'
          ? await bookingService.confirmPickupHandover(booking.id, {
              photos,
              condition,
              notes: notes.trim() || undefined,
            })
          : await bookingService.confirmReturnHandover(booking.id, {
              photos,
              condition,
              notes: notes.trim() || undefined,
            });
      setNotes('');
      setPhotos([]);
      onUpdated(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Xác nhận biên bản bàn giao không thành công.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-stone-900">
            {mode === 'PICKUP'
              ? 'Biên bản Bàn giao nhận đồ (PICKUP Handover)'
              : 'Biên bản Hoàn trả thiết bị (RETURN Confirmation)'}
          </h3>
          <p className="text-xs text-stone-500">
            {mode === 'PICKUP'
              ? 'Cả Chủ thiết bị và Người thuê cần xác nhận để chuyển sang trạng thái Đang sử dụng (IN_USE).'
              : 'Cả hai bên cần xác nhận tình trạng hoàn trả để hoàn tất giao dịch (COMPLETED).'}
          </p>
        </div>
        <Badge
          variant={
            ownerConfirmation && renterConfirmation ? 'emerald' : 'amber'
          }
        >
          {ownerConfirmation && renterConfirmation
            ? 'Đủ 2 bên xác nhận'
            : `${confirmations.length}/2 bên đã xác nhận`}
        </Badge>
      </div>

      {/* Confirmation status grid for both parties */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className={`p-3 rounded-xl border text-xs ${
            ownerConfirmation
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-stone-50 border-stone-200 text-stone-600'
          }`}
        >
          <div className="flex items-center justify-between font-bold mb-1">
            <span>Chủ thiết bị ({booking.owner.fullName})</span>
            {ownerConfirmation ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600" />
            )}
          </div>
          {ownerConfirmation ? (
            <>
              <p className="text-[11px] text-stone-600">
                Đã xác nhận: {formatVietnamDateTime(ownerConfirmation.confirmedAt)}
              </p>
              {ownerConfirmation.note && (
                <p className="mt-1 italic text-stone-800">
                  “{ownerConfirmation.note}”
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-stone-500">Chưa xác nhận</p>
          )}
        </div>

        <div
          className={`p-3 rounded-xl border text-xs ${
            renterConfirmation
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-stone-50 border-stone-200 text-stone-600'
          }`}
        >
          <div className="flex items-center justify-between font-bold mb-1">
            <span>Người thuê ({booking.renter.fullName})</span>
            {renterConfirmation ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600" />
            )}
          </div>
          {renterConfirmation ? (
            <>
              <p className="text-[11px] text-stone-600">
                Đã xác nhận: {formatVietnamDateTime(renterConfirmation.confirmedAt)}
              </p>
              {renterConfirmation.note && (
                <p className="mt-1 italic text-stone-800">
                  “{renterConfirmation.note}”
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-stone-500">Chưa xác nhận</p>
          )}
        </div>
      </div>

      {/* Existing uploaded handover photos */}
      {handoverRecord && handoverRecord.photos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-700 mb-1.5">
            Hình ảnh hiện trạng đã lưu ({handoverRecord.photos.length}):
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {handoverRecord.photos.map((url, idx) => (
              <AuthorizedMediaImage
                key={`${url}-${idx}`}
                src={url}
                alt="Handover evidence"
                className="w-full h-24 object-cover rounded-xl border border-stone-200"
              />
            ))}
          </div>
        </div>
      )}

      {/* Action form if current user hasn't confirmed yet */}
      {!hasCurrentUserConfirmed && (
        <form
          onSubmit={handleSubmit}
          className="pt-3 border-t border-stone-100 space-y-3"
        >
          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tình trạng thiết bị thực tế
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as GearCondition)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white"
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Ảnh chụp tình trạng ({photos.length})
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadPhotos}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-3.5 h-3.5" />
                Tải ảnh kiểm tra thiết bị
              </Button>
            </div>
          </div>

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((url, idx) => (
                <div
                  key={url}
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-300"
                >
                  <AuthorizedMediaImage
                    src={url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Ghi chú kiểm tra bàn giao
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'PICKUP'
                  ? 'VD: Đã kiểm tra đủ cọc lều, khóa kéo hoạt động trơn tru...'
                  : 'VD: Đã vệ sinh sạch sẽ và bàn giao đầy đủ phụ kiện...'
              }
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={submitting || uploading}
            >
              <CheckCircle2 className="w-4 h-4" />
              {mode === 'PICKUP'
                ? 'Xác nhận Bàn giao Nhận thiết bị'
                : 'Xác nhận Hoàn trả Thiết bị'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
};

export const ReturnConfirmation = HandoverForm;

export const ReviewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  targetName: string;
  onSuccess: () => void;
}> = ({ isOpen, onClose, bookingId, targetName, onSuccess }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError('Vui lòng nhập nội dung đánh giá trải nghiệm.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await bookingService.createReview(bookingId, {
        rating,
        comment: comment.trim(),
      });
      setComment('');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Gửi đánh giá không thành công.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 className="text-base font-bold text-stone-900">
            Đánh giá giao dịch với {targetName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2">
              Mức độ hài lòng (1 – 5 sao)
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`p-2 rounded-xl border transition-colors ${
                    star <= rating
                      ? 'bg-amber-50 border-amber-300 text-amber-500'
                      : 'bg-stone-50 border-stone-200 text-stone-300'
                  }`}
                >
                  <Star className="w-5 h-5 fill-current" />
                </button>
              ))}
              <span className="text-xs font-bold text-stone-800 ml-2">
                {rating}/5 sao
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Nhận xét chi tiết
            </label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Chia sẻ về chất lượng thiết bị, sự đúng giờ và thái độ hợp tác..."
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              Gửi đánh giá uy tín
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const DisputeForm: React.FC<{
  bookingId: string;
  onSuccess: () => void;
}> = ({ bookingId, onSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>('DAMAGED_GEAR');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <ShieldAlert className="w-4 h-4 text-red-600" />
          Báo cáo sự cố / Khiếu nại giao dịch
        </Button>
      </div>
    );
  }

  const handleUploadEvidence = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setUploading(true);
    try {
      const uploaded = await socialService.uploadMedia(files, {
        scope: 'BOOKING_DISPUTE',
        bookingId,
      });
      setEvidence((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể tải ảnh bằng chứng tranh chấp. Vui lòng thử lại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Vui lòng nhập mô tả chi tiết sự việc cần khiếu nại.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await bookingService.createDispute(bookingId, {
        reason,
        description: description.trim(),
        evidence,
      });
      setOpen(false);
      setDescription('');
      setEvidence([]);
      onSuccess();
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Gửi báo cáo tranh chấp thất bại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5 border-red-200 bg-red-50/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-red-900 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-red-700" />
          Gửi yêu cầu xử lý tranh chấp (Dispute Management)
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-stone-500 hover:underline"
        >
          Đóng
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-red-100 text-xs text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Phân loại nguyên nhân tranh chấp
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as DisputeReason)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white"
          >
            {DISPUTE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Mô tả sự việc & đề xuất hướng giải quyết
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nêu rõ tình trạng phát sinh để Quản trị viên đối chiếu biên bản Handover..."
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Ảnh/Video bằng chứng bảo mật ({evidence.length})
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUploadEvidence}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="w-3.5 h-3.5" />
            Tải ảnh bằng chứng
          </Button>
          {evidence.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {evidence.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-300"
                >
                  <AuthorizedMediaImage
                    src={url}
                    alt="Dispute evidence preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEvidence((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            isLoading={submitting || uploading}
          >
            Gửi hồ sơ khiếu nại
          </Button>
        </div>
      </form>
    </Card>
  );
};
