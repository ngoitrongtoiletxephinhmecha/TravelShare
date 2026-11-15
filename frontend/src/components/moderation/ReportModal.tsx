import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Flag, X } from 'lucide-react';
import {
  moderationService,
  ReportTargetType,
} from '../../services/moderation.service';
import { Button } from '../ui/DesignSystem';

const REPORT_REASONS = [
  'Nội dung spam hoặc quảng cáo trái phép',
  'Ngôn từ thù ghét, xúc phạm hoặc quấy rối',
  'Thông tin sai lệch / lừa đảo',
  'Nội dung không phù hợp hoặc vi phạm nội quy cộng đồng',
  'Thiết bị hư hỏng / mô tả không trung thực',
  'Khác',
];

export const ReportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
}> = ({ isOpen, onClose, targetType, targetId, targetLabel }) => {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setSubmitted(false);
    setError(null);
    setDescription('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await moderationService.submitReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Không thể gửi báo cáo. Vui lòng thử lại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-600" />
            <h3 className="text-base font-bold text-stone-900">
              Báo cáo vi phạm
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h4 className="text-sm font-bold text-stone-900">
              Đã tiếp nhận báo cáo của bạn
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed">
              Đội ngũ quản trị sẽ xem xét nội dung này và gửi thông báo kết quả
              xử lý cho bạn ngay khi hoàn tất.
            </p>
            <Button variant="primary" size="sm" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {targetLabel && (
              <div className="text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-700">
                Đối tượng báo cáo:{' '}
                <span className="font-semibold text-stone-900">
                  {targetLabel}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Lý do báo cáo
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-emerald-600"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Mô tả chi tiết (không bắt buộc)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cung cấp thêm thông tin để quản trị viên xử lý nhanh hơn..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={submitting}>
                Gửi báo cáo
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
