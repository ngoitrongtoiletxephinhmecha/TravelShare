import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  BookingAuditEntry,
  BookingStatus,
  GearSharingType,
} from '../../types';
import { Badge, Card } from '../ui/DesignSystem';
import {
  formatVietnamDate,
  formatVietnamDateTime,
  formatVnd,
} from '../../utils/format';

export const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  {
    label: string;
    variant: 'emerald' | 'amber' | 'stone' | 'red' | 'blue';
    description: string;
  }
> = {
  PENDING: {
    label: 'Chờ chủ đồ duyệt',
    variant: 'amber',
    description: 'Yêu cầu đã gửi, đang chờ chủ thiết bị xác nhận.',
  },
  APPROVED: {
    label: 'Đã duyệt • Chờ bàn giao',
    variant: 'blue',
    description:
      'Lịch đã được giữ chỗ. Hai bên gặp nhận đồ và xác nhận Handover.',
  },
  IN_USE: {
    label: 'Đang sử dụng',
    variant: 'emerald',
    description: 'Đã bàn giao thiết bị thành công cho chuyến đi.',
  },
  RETURN_PENDING: {
    label: 'Chờ xác nhận trả đồ',
    variant: 'amber',
    description: 'Một bên đã báo hoàn trả, chờ bên còn lại kiểm tra xác nhận.',
  },
  COMPLETED: {
    label: 'Hoàn tất giao dịch',
    variant: 'emerald',
    description:
      'Thiết bị đã hoàn trả nguyên vẹn. Hai bên có thể đánh giá uy tín.',
  },
  REJECTED: {
    label: 'Chủ đồ từ chối',
    variant: 'red',
    description: 'Yêu cầu không được chấp nhận bởi chủ thiết bị.',
  },
  CANCELLED: {
    label: 'Đã hủy',
    variant: 'stone',
    description: 'Giao dịch đã được hủy và giải phóng lịch thiết bị.',
  },
  EXPIRED: {
    label: 'Hết hạn phản hồi',
    variant: 'stone',
    description: 'Quá thời hạn chờ duyệt nên tự động đóng yêu cầu.',
  },
  DISPUTED: {
    label: 'Đang khiếu nại / Tranh chấp',
    variant: 'red',
    description: 'Giao dịch đang được tạm khóa để xử lý tranh chấp.',
  },
};

export const BookingStatusBadge: React.FC<{ status: BookingStatus }> = ({
  status,
}) => {
  const cfg = BOOKING_STATUS_CONFIG[status] || {
    label: status,
    variant: 'stone' as const,
  };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

export const BookingDateRangePicker: React.FC<{
  startDate: string;
  endDate: string;
  quantity: number;
  maxQuantity: number;
  minRentalDays?: number;
  maxRentalDays?: number;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onQuantityChange: (val: number) => void;
}> = ({
  startDate,
  endDate,
  quantity,
  maxQuantity,
  minRentalDays = 1,
  maxRentalDays = 14,
  onStartDateChange,
  onEndDateChange,
  onQuantityChange,
}) => {
  const rentalDays = React.useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(`${startDate}T00:00:00.000Z`);
    const e = new Date(`${endDate}T00:00:00.000Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) return 0;
    return Math.max(
      1,
      Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }, [startDate, endDate]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-stone-600 mb-1">
            Ngày nhận thiết bị (startAt)
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-stone-600 mb-1">
            Ngày trả thiết bị (endAt)
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-semibold text-stone-600 mb-1">
            Số lượng mượn/thuê (Tối đa {maxQuantity})
          </label>
          <input
            type="number"
            min={1}
            max={maxQuantity}
            value={quantity}
            onChange={(e) =>
              onQuantityChange(
                Math.min(
                  maxQuantity,
                  Math.max(1, Number(e.target.value) || 1),
                ),
              )
            }
            className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-300 bg-white"
          />
        </div>

        <div className="text-right pt-4">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
            <Calendar className="w-3.5 h-3.5" />
            {rentalDays > 0 ? `${rentalDays} ngày` : 'Chọn ngày'}
          </span>
          <span className="block text-[10px] text-stone-500 mt-0.5">
            Cho phép: {minRentalDays}–{maxRentalDays} ngày • Quy ước [startAt,
            endAt)
          </span>
        </div>
      </div>
    </div>
  );
};

export const BookingSummary: React.FC<{
  sharingType: GearSharingType;
  pricePerDay: number;
  depositAmount: number;
  rentalDays: number;
  quantity: number;
  startAt?: string;
  endAt?: string;
}> = ({
  sharingType,
  pricePerDay,
  depositAmount,
  rentalDays,
  quantity,
  startAt,
  endAt,
}) => {
  const isFreeLoan = sharingType === 'FREE_LOAN' || pricePerDay === 0;
  const effectiveDays = Math.max(1, rentalDays);
  const unitPrice = isFreeLoan ? 0 : pricePerDay;
  const rentalTotal = isFreeLoan ? 0 : unitPrice * effectiveDays * quantity;
  const totalDeposit = depositAmount * quantity;

  return (
    <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
      <p className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
        Tóm tắt chi phí & điều kiện thuê
      </p>

      {startAt && endAt && (
        <div className="flex justify-between text-stone-600 pb-1.5 border-b border-stone-200/70">
          <span>Thời gian thuê:</span>
          <span className="font-semibold text-stone-900">
            {formatVietnamDate(startAt)} → {formatVietnamDate(endAt)} (
            {effectiveDays} ngày)
          </span>
        </div>
      )}

      <div className="flex justify-between text-stone-600">
        <span>Đơn giá thuê / ngày:</span>
        <span className="font-semibold text-stone-900">
          {isFreeLoan ? 'Miễn phí (0 ₫)' : formatVnd(unitPrice)}
        </span>
      </div>

      <div className="flex justify-between text-stone-600">
        <span>
          Số lượng × Số ngày ({quantity} thiết bị × {effectiveDays} ngày):
        </span>
        <span className="font-bold text-emerald-800">
          {isFreeLoan ? '0 ₫ (Cho mượn miễn phí)' : formatVnd(rentalTotal)}
        </span>
      </div>

      <div className="flex justify-between text-stone-600 pt-1.5 border-t border-stone-200/70">
        <span>Tiền đặt cọc bảo đảm (hoàn lại khi trả đồ):</span>
        <span className="font-bold text-amber-800">
          {formatVnd(totalDeposit)}
        </span>
      </div>
    </div>
  );
};

const WORKFLOW_STEPS: {
  key: BookingStatus;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { key: 'PENDING', label: 'Gửi yêu cầu', icon: Clock },
  { key: 'APPROVED', label: 'Chủ đồ duyệt', icon: CheckCircle2 },
  { key: 'IN_USE', label: 'Bàn giao & Sử dụng', icon: PackageCheck },
  { key: 'RETURN_PENDING', label: 'Báo hoàn trả', icon: RotateCcw },
  { key: 'COMPLETED', label: 'Hoàn tất & Đánh giá', icon: CheckCircle2 },
];

export const BookingTimeline: React.FC<{
  status: BookingStatus;
  statusHistory: BookingAuditEntry[];
}> = ({ status, statusHistory }) => {
  const stepIndexMap: Record<string, number> = {
    PENDING: 0,
    APPROVED: 1,
    IN_USE: 2,
    RETURN_PENDING: 3,
    COMPLETED: 4,
  };
  const activeIdx = stepIndexMap[status] ?? -1;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-900">
          Tiến trình giao dịch (Booking Workflow)
        </h3>
        <BookingStatusBadge status={status} />
      </div>

      {/* Main 5-step progress bar */}
      {activeIdx >= 0 ? (
        <div className="grid grid-cols-5 gap-2">
          {WORKFLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = idx <= activeIdx;
            const isCurrent = idx === activeIdx;
            return (
              <div
                key={step.key}
                className={`p-2.5 rounded-xl border text-center transition-colors ${
                  isCurrent
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                    : isCompleted
                      ? 'bg-stone-50 border-emerald-200 text-emerald-800'
                      : 'bg-stone-50/50 border-stone-200 text-stone-400'
                }`}
              >
                <Icon className="w-4 h-4 mx-auto mb-1" />
                <p className="text-[11px] font-semibold leading-tight">
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          {status === 'DISPUTED' ? (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          ) : status === 'REJECTED' ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{BOOKING_STATUS_CONFIG[status]?.description}</span>
        </div>
      )}

      {/* Detailed Audit History */}
      {statusHistory && statusHistory.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t border-stone-100">
          <p className="text-xs font-semibold text-stone-700">
            Nhật ký chuyển trạng thái (Audit Log)
          </p>
          <div className="space-y-2">
            {statusHistory.map((entry, idx) => (
              <div
                key={`${entry.toStatus}-${idx}`}
                className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200/60 text-xs"
              >
                <div>
                  <span className="font-bold text-stone-900">
                    {entry.fromStatus
                      ? `${entry.fromStatus} → ${entry.toStatus}`
                      : `Khởi tạo (${entry.toStatus})`}
                  </span>
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-stone-200/70 text-[10px] font-semibold text-stone-700">
                    {entry.actorRole}
                  </span>
                  {entry.note && (
                    <p className="text-stone-600 mt-0.5">{entry.note}</p>
                  )}
                </div>
                <span className="text-[11px] text-stone-500 shrink-0">
                  {formatVietnamDateTime(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
