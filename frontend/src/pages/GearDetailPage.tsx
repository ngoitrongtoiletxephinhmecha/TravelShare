import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Edit3,
  Flag,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { gearService } from '../services/gear.service';
import { bookingService } from '../services/booking.service';
import { chatService } from '../services/chat.service';
import { useAuthStore } from '../store/auth.store';
import { Badge, Button, Card, Skeleton } from '../components/ui/DesignSystem';
import {
  CONDITION_LABELS,
  GearCard,
  SHARING_TYPE_LABELS,
} from '../components/gear/GearCard';
import { BookingRequestModal } from '../components/booking/BookingModals';
import { MediaGallery } from '../components/social/MediaGallery';
import { ReportModal } from '../components/moderation/ReportModal';
import { formatVietnamDateTime, formatVnd } from '../utils/format';

export const GearDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const paramStartAt = searchParams.get('startAt')?.slice(0, 10) || '';
  const paramEndAt = searchParams.get('endAt')?.slice(0, 10) || '';
  const paramQty = Number(searchParams.get('quantity') || 0);
  const paramOpenBooking = searchParams.get('openBooking') === '1';
  const paramSharingType = searchParams.get('sharingType') as
    | 'RENT'
    | 'FREE_LOAN'
    | 'BOTH'
    | null;
  const rawExpectedPrice = searchParams.get('expectedPricePerDay');
  const rawExpectedDeposit = searchParams.get('expectedDepositAmount');
  const paramExpectedPricePerDay =
    rawExpectedPrice !== null && rawExpectedPrice !== '' && !isNaN(Number(rawExpectedPrice))
      ? Number(rawExpectedPrice)
      : undefined;
  const paramExpectedDepositAmount =
    rawExpectedDeposit !== null && rawExpectedDeposit !== '' && !isNaN(Number(rawExpectedDeposit))
      ? Number(rawExpectedDeposit)
      : undefined;

  const [checkStart, setCheckStart] = useState(paramStartAt || '2026-12-01');
  const [checkEnd, setCheckEnd] = useState(paramEndAt || '2026-12-03');
  const [checkQty, setCheckQty] = useState(
    paramQty > 0 && Number.isInteger(paramQty) ? paramQty : 1,
  );
  const [availabilityResult, setAvailabilityResult] = useState<any | null>(
    null,
  );
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    if (paramStartAt) setCheckStart(paramStartAt);
    if (paramEndAt) setCheckEnd(paramEndAt);
    if (paramQty > 0 && Number.isInteger(paramQty)) setCheckQty(paramQty);
  }, [paramStartAt, paramEndAt, paramQty]);

  // Owner block form state
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockQty, setBlockQty] = useState(1);
  const [blockNote, setBlockNote] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const {
    data: gear,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['gear-detail', id],
    queryFn: () => gearService.getGearById(id!),
    enabled: Boolean(id),
  });

  const { data: gearReviews = [] } = useQuery({
    queryKey: ['gear-reviews', id],
    queryFn: () => bookingService.getGearReviews(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!gear || !paramStartAt || !paramEndAt) return;
    const qty = paramQty > 0 ? Math.min(paramQty, gear.totalQuantity) : 1;
    setCheckQty(qty);
    gearService
      .checkAvailability(gear.id, {
        startAt: paramStartAt,
        endAt: paramEndAt,
        quantity: qty,
      })
      .then((res) => setAvailabilityResult(res))
      .catch(() => undefined);

    if (paramOpenBooking && isAuthenticated && user?.id !== gear.ownerId) {
      setBookingModalOpen(true);
    }
  }, [gear?.id, paramStartAt, paramEndAt, paramQty, paramOpenBooking, isAuthenticated, user?.id]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-5">
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !gear) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-stone-900">
            Không tìm thấy thiết bị hoặc thiết bị chưa được công khai
          </h2>
          <p className="text-xs text-stone-500">
            Thiết bị có thể đang ở trạng thái Bản nháp (DRAFT), Lưu trữ
            (ARCHIVED) hoặc đường dẫn không tồn tại.
          </p>
          <Link to="/gear">
            <Button variant="primary" size="sm">
              Quay lại Chợ Thiết Bị
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isOwner = Boolean(
    user && (user.id === gear.ownerId || user.role === 'ADMIN'),
  );

  const handleCheckAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckError(null);
    setChecking(true);
    try {
      const res = await gearService.checkAvailability(gear.id, {
        startAt: checkStart,
        endAt: checkEnd,
        quantity: checkQty,
      });
      setAvailabilityResult(res);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Khoảng ngày kiểm tra không hợp lệ (startAt phải nhỏ hơn endAt)';
      setCheckError(Array.isArray(msg) ? msg.join(', ') : msg);
      setAvailabilityResult(null);
    } finally {
      setChecking(false);
    }
  };

  const handleRequestBookingClick = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (user?.id === gear.ownerId) {
      setCheckError('Bạn không thể tự gửi yêu cầu thuê thiết bị của chính mình.');
      return;
    }
    setCheckError(null);
    setBookingModalOpen(true);
  };

  const handleAddUnavailablePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStart || !blockEnd) return;
    setCheckError(null);
    setBlocking(true);
    try {
      await gearService.addUnavailablePeriod(gear.id, {
        startAt: blockStart,
        endAt: blockEnd,
        reservedQuantity: blockQty,
        note: blockNote,
      });
      setBlockStart('');
      setBlockEnd('');
      setBlockNote('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['gear-detail', gear.id] });
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Không thể khóa lịch khả dụng';
      setCheckError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBlocking(false);
    }
  };

  const handleRemovePeriod = async (periodId: string) => {
    await gearService.removeUnavailablePeriod(gear.id, periodId);
    refetch();
  };

  const handleOpenOwnerChat = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (isOwner) {
      navigate('/messages');
      return;
    }
    setOpeningChat(true);
    try {
      const conv = await chatService.openConversation({
        targetUserId: gear.ownerId,
        gearId: gear.id,
      });
      navigate(`/messages/${conv.id}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Không thể mở cuộc hội thoại.';
      setCheckError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setOpeningChat(false);
    }
  };

  const attributeEntries = Object.entries(gear.attributes || {});

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/gear"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Chợ Thiết Bị
        </Link>

        {isOwner ? (
          <div className="flex items-center gap-2">
            <Badge variant="stone">Trạng thái: {gear.status}</Badge>
            <Link to={`/gear/${gear.id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit3 className="w-3.5 h-3.5" />
                Chỉnh sửa thiết bị
              </Button>
            </Link>
          </div>
        ) : (
          user && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReportOpen(true)}
            >
              <Flag className="w-3.5 h-3.5" />
              Báo cáo thiết bị
            </Button>
          )
        )}
      </div>

      {/* Demo Warning Alert */}
      {gear.isDemo && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>DỮ LIỆU DEMO:</strong> Đây là thiết bị mẫu phục vụ trình
            diễn giao diện và kiểm thử bộ lọc, không phải tin đăng giao dịch
            thương mại thực tế.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Images, Details, Attributes, Rules (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="overflow-hidden">
            {gear.images && gear.images.length > 0 ? (
              <MediaGallery mediaUrls={gear.images} altPrefix={gear.title} />
            ) : (
              <div className="aspect-[16/10] bg-stone-100 flex items-center justify-center text-xs text-stone-400">
                Chưa có hình ảnh thiết bị
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="emerald">{gear.categoryName}</Badge>
                <Badge variant="stone">
                  {SHARING_TYPE_LABELS[gear.sharingType]}
                </Badge>
                <Badge variant="stone">
                  Tình trạng: {CONDITION_LABELS[gear.condition]}
                </Badge>
                {gear.brand && (
                  <Badge variant="stone">Hãng: {gear.brand}</Badge>
                )}
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-stone-900">
                {gear.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  Khu vực nhận đồ gần đúng: {gear.pickupAreaLabel}
                </span>
                <span>•</span>
                <span>Tổng số lượng: {gear.totalQuantity} chiếc</span>
              </div>
            </div>

            {/* Dynamic Attributes Table */}
            {attributeEntries.length > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3">
                  Thông số & Thuộc tính kỹ thuật
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {attributeEntries.map(([key, val]) => (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70"
                    >
                      <p className="text-[11px] text-stone-500">{key}</p>
                      <p className="text-xs font-bold text-stone-900 mt-0.5">
                        {typeof val === 'boolean'
                          ? val
                            ? 'Có'
                            : 'Không'
                          : String(val)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="pt-4 border-t border-stone-100">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Mô tả chi tiết thiết bị
              </h2>
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                {gear.description}
              </p>
            </div>

            {/* Usage Rules */}
            {gear.usageRules && gear.usageRules.length > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  Quy định sử dụng & Bảo quản
                </h2>
                <ul className="space-y-1.5 text-xs text-stone-700 list-disc list-inside">
                  {gear.usageRules.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Unavailable / Blocked Periods List */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-bold text-stone-900">
                  Lịch đã khóa / Đã giữ chỗ ({gear.availability?.periods?.length || 0})
                </h2>
              </div>
              <span className="text-[11px] text-stone-400">
                Quy ước [startAt, endAt)
              </span>
            </div>

            {!gear.availability?.periods ||
              gear.availability.periods.length === 0 ? (
              <p className="text-xs text-stone-500">
                Thiết bị hiện chưa có khoảng thời gian bị khóa nào.
              </p>
            ) : (
              <div className="space-y-2">
                {gear.availability.periods.map((period) => (
                  <div
                    key={period.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-stone-800">
                        <span>
                          {formatVietnamDateTime(period.startAt)} →{' '}
                          {formatVietnamDateTime(period.endAt)}
                        </span>
                        <Badge
                          variant={
                            period.reason === 'BOOKED' ? 'emerald' : 'amber'
                          }
                        >
                          {period.reason === 'BOOKED'
                            ? 'BOOKED (Giữ chỗ thuê)'
                            : 'OWNER_BLOCKED (Chủ đồ khóa)'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Số lượng khóa: {period.reservedQuantity} •{' '}
                        {period.note || 'Không có ghi chú'}
                      </p>
                    </div>

                    {isOwner && period.reason === 'OWNER_BLOCKED' && (
                      <button
                        type="button"
                        onClick={() => handleRemovePeriod(period.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50"
                        title="Xóa lịch khóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Owner Add Unavailable Period Form */}
            {isOwner && (
              <form
                onSubmit={handleAddUnavailablePeriod}
                className="pt-3 border-t border-stone-100 space-y-3"
              >
                <p className="text-xs font-bold text-stone-800">
                  Khóa lịch không cho thuê (Dành cho chủ thiết bị)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="date"
                    required
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-stone-300"
                  />
                  <input
                    type="date"
                    required
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-stone-300"
                  />
                  <input
                    type="number"
                    min={1}
                    max={gear.totalQuantity}
                    value={blockQty}
                    onChange={(e) => setBlockQty(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-stone-300"
                    placeholder="Số lượng"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={blockNote}
                    onChange={(e) => setBlockNote(e.target.value)}
                    placeholder="Ghi chú (VD: Bảo dưỡng lều hoặc tự sử dụng cuối tuần)"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    isLoading={blocking}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Khóa lịch
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Right Column: Pricing, Availability Check & Owner Card (5 cols) */}
        <div className="lg:col-span-5 space-y-5 sticky top-20">
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-baseline justify-between pb-4 border-b border-stone-100">
              <div>
                <p className="text-xs text-stone-500">Giá chia sẻ theo ngày</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {formatVnd(gear.pricePerDay)}
                  {gear.pricePerDay > 0 && (
                    <span className="text-xs font-normal text-stone-500">
                      /ngày
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-500">Tiền cọc dự kiến</p>
                <p className="text-sm font-bold text-stone-900">
                  {formatVnd(gear.depositAmount)}
                </p>
              </div>
            </div>

            <div className="text-xs text-stone-600 space-y-1 bg-stone-50 p-3 rounded-xl">
              <p>
                • Thời gian thuê tối thiểu:{' '}
                <strong>{gear.availabilitySettings?.minRentalDays || 1} ngày</strong>{' '}
                (Tối đa {gear.availabilitySettings?.maxRentalDays || 14} ngày)
              </p>
              <p>
                • Khu vực giao nhận gần đúng:{' '}
                <strong>{gear.pickupAreaLabel}</strong> (Không hiển thị địa chỉ
                nhà riêng khi chưa xác nhận giao dịch)
              </p>
            </div>

            {/* Availability Checker Form */}
            <form onSubmit={handleCheckAvailability} className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Kiểm tra Lịch khả dụng & Tạm tính chi phí
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Ngày nhận (startAt)
                  </label>
                  <input
                    type="date"
                    required
                    value={checkStart}
                    onChange={(e) => setCheckStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Ngày trả (endAt)
                  </label>
                  <input
                    type="date"
                    required
                    value={checkEnd}
                    onChange={(e) => setCheckEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  Số lượng cần thuê/mượn (Tối đa {gear.totalQuantity})
                </label>
                <input
                  type="number"
                  min={1}
                  max={gear.totalQuantity}
                  value={checkQty}
                  onChange={(e) => setCheckQty(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300"
                />
              </div>

              {checkError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {checkError}
                </div>
              )}

              {availabilityResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${availabilityResult.isAvailable
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {availabilityResult.isAvailable
                        ? `Thiết bị CÒN TRỐNG (${availabilityResult.availableQuantity}/${availabilityResult.totalQuantity} chiếc khả dụng)`
                        : 'Thiết bị ĐÃ KÍN LỊCH trong khoảng thời gian này'}
                    </span>
                  </div>
                  {availabilityResult.estimatedCostVnd && (
                    <div className="pt-1 border-t border-emerald-200/60 space-y-0.5 text-[11px]">
                      <p>
                        Số ngày tính phí:{' '}
                        <strong>
                          {availabilityResult.requestedInterval?.rentalDays}{' '}
                          ngày
                        </strong>
                      </p>
                      <p>
                        Phí thuê dự kiến:{' '}
                        <strong>
                          {formatVnd(
                            availabilityResult.estimatedCostVnd.totalRentalFee,
                          )}
                        </strong>
                      </p>
                      <p>
                        Tiền cọc hoàn lại:{' '}
                        <strong>
                          {formatVnd(
                            availabilityResult.estimatedCostVnd.depositAmount,
                          )}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <Button
                  type="submit"
                  variant="outline"
                  isLoading={checking}
                  className="w-full"
                >
                  Kiểm tra lịch trống
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  isLoading={checking}
                  onClick={handleRequestBookingClick}
                  className="w-full"
                >
                  Gửi yêu cầu thuê
                </Button>
              </div>
            </form>
          </Card>

          {/* Owner Profile Card */}
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              Thông tin chủ thiết bị
            </h3>
            <div className="flex items-center justify-between gap-3">
              <Link
                to={`/users/${gear.owner.username}`}
                className="flex items-center gap-3 min-w-0 group"
              >
                <img
                  src={
                    gear.owner.avatarUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(gear.owner.fullName)}&background=166534&color=fff`
                  }
                  alt={gear.owner.fullName}
                  className="w-12 h-12 rounded-full object-cover border border-emerald-200"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900 group-hover:text-emerald-700 truncate">
                    {gear.owner.fullName}
                  </p>
                  <p className="text-xs text-stone-500 flex items-center gap-1">
                    @{gear.owner.username} •
                    <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {gear.owner.trustScore}★
                    </span>
                  </p>
                </div>
              </Link>

              <Link to={`/users/${gear.owner.username}`}>
                <Button variant="outline" size="sm">
                  Xem hồ sơ
                </Button>
              </Link>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              isLoading={openingChat}
              onClick={handleOpenOwnerChat}
            >
              <MessageSquare className="w-4 h-4" />
              {isOwner
                ? 'Xem hộp thư tin nhắn thiết bị'
                : `Nhắn tin (@${gear.owner.username})`}
            </Button>
          </Card>
        </div>
      </div>

      {/* Gear Reviews from Completed Bookings */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            Đánh giá từ người đã thuê ({gearReviews.length})
          </h2>
          <span className="text-xs font-semibold text-emerald-800">
            Điểm trung bình: {gear.ratingAvg}★
          </span>
        </div>

        {gearReviews.length === 0 ? (
          <p className="text-xs text-stone-500">
            Chưa có đánh giá nào cho thiết bị này. Đánh giá chỉ được mở sau khi
            giao dịch thuê/mượn hoàn tất (COMPLETED).
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gearReviews.map((rev) => (
              <div
                key={rev.id}
                className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <Link
                    to={`/users/${rev.reviewer?.username || rev.reviewer?.userId}`}
                    className="font-bold text-stone-900 hover:text-emerald-700"
                  >
                    {rev.reviewer?.fullName || 'Thành viên TravelShare'}
                  </Link>
                  <span className="font-bold text-amber-500">
                    {'★'.repeat(rev.rating)} ({rev.rating}/5)
                  </span>
                </div>
                <p className="text-stone-700 leading-relaxed">{rev.comment}</p>
                <p className="text-[10px] text-stone-400">
                  {formatVietnamDateTime(rev.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Similar Gear Items */}
      {gear.similarItems && gear.similarItems.length > 0 && (
        <section className="space-y-4 pt-4">
          <h2 className="text-base font-bold text-stone-900">
            Thiết bị tương tự cùng danh mục ({gear.categoryName})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {gear.similarItems.map((sim) => (
              <GearCard key={sim.id} gear={sim} />
            ))}
          </div>
        </section>
      )}

      <BookingRequestModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        gear={gear}
        initialStartDate={checkStart}
        initialEndDate={checkEnd}
        initialQuantity={checkQty}
        expectedPricePerDay={paramExpectedPricePerDay}
        expectedDepositAmount={paramExpectedDepositAmount}
        expectedSharingType={paramSharingType || undefined}
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="GEAR"
        targetId={gear.id}
        targetLabel={gear.title}
      />
    </div>
  );
};
