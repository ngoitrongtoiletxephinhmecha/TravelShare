import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Camera,
  Hash,
  Link2,
  MapPin,
  Tent,
  Trash2,
  X,
} from 'lucide-react';
import { socialService } from '../../services/social.service';
import { gearService } from '../../services/gear.service';
import { ActivityType, PostItem } from '../../types';
import { Button } from '../ui/DesignSystem';
import { isVideoUrl } from './MediaGallery';
import { formatVnd } from '../../utils/format';

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'TREKKING', label: 'Trekking / Đi bộ đường dài' },
  { value: 'CAMPING', label: 'Camping / Cắm trại' },
  { value: 'MOTORBIKE_TOUR', label: 'Phượt xe máy' },
  { value: 'BACKPACKING', label: 'Du lịch bụi (Backpacking)' },
  { value: 'MOUNTAINEERING', label: 'Leo núi kỹ thuật' },
  { value: 'BEACH', label: 'Đi biển' },
  { value: 'SIGHTSEEING', label: 'Tham quan / Khám phá' },
  { value: 'OTHER', label: 'Hoạt động khác' },
];

export const CreatePostModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (post: PostItem) => void;
  communityId?: string;
  communityName?: string;
}> = ({ isOpen, onClose, onCreated, communityId, communityName }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [content, setContent] = useState('');
  const [locationName, setLocationName] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('TREKKING');
  const [hashtagInput, setHashtagInput] = useState('');
  const [selectedGearIds, setSelectedGearIds] = useState<string[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [externalMediaUrl, setExternalMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: availableGearRes } = useQuery({
    queryKey: ['post-modal-gear-options'],
    queryFn: () => gearService.searchGear({ limit: 20 }),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const availableGear = availableGearRes?.items || [];

  const toggleGearTag = (gearId: string) => {
    setSelectedGearIds((prev) =>
      prev.includes(gearId)
        ? prev.filter((id) => id !== gearId)
        : [...prev, gearId],
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setUploading(true);
    try {
      const uploaded = await socialService.uploadMedia(files);
      setMediaUrls((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể tải lên file. Chỉ hỗ trợ ảnh (JPG, PNG, WEBP) và video (MP4, WEBM) tối đa 20MB.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddExternalUrl = () => {
    const trimmed = externalMediaUrl.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('data:')) {
      setError(
        'Không hỗ trợ chuỗi ảnh base64 trực tiếp. Hãy upload file hoặc nhập URL hợp lệ.',
      );
      return;
    }
    setMediaUrls((prev) => [...prev, trimmed]);
    setExternalMediaUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Vui lòng nhập nội dung bài viết');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const explicitTags = hashtagInput
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const created = await socialService.createPost({
        content: content.trim(),
        mediaUrls,
        hashtags: explicitTags,
        locationName: locationName.trim() || undefined,
        activityType,
        gearTags: selectedGearIds,
        communityId,
      });

      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['trending-hashtags'] });
      onCreated?.(created);
      setContent('');
      setLocationName('');
      setHashtagInput('');
      setSelectedGearIds([]);
      setMediaUrls([]);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đăng bài viết thất bại';
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
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-stone-900">
            {communityName
              ? `Đăng bài trong ${communityName}`
              : 'Đăng bài chia sẻ chuyến đi'}
          </h2>
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
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Chia sẻ kinh nghiệm cung đường, tình trạng thời tiết, nguồn nước hoặc thiết bị cần chuẩn bị... (Có thể gõ trực tiếp #hashtag)"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                <MapPin className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
                Địa điểm / Cung đường
              </label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="VD: Đỉnh Lảo Thẩn, Y Tý, Lào Cai"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Loại hoạt động du lịch
              </label>
              <select
                value={activityType}
                onChange={(e) =>
                  setActivityType(e.target.value as ActivityType)
                }
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 bg-white focus:border-emerald-600 focus:outline-none"
              >
                {ACTIVITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              <Hash className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
              Hashtags bổ sung
            </label>
            <input
              type="text"
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              placeholder="#trekkingvietnam #laothan #camping"
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Gear Tagging Section (Social <-> Marketplace Integration) */}
          {availableGear.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-2">
              <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                <Tent className="w-3.5 h-3.5 text-emerald-700" />
                Gắn thiết bị du lịch trong bài viết ({selectedGearIds.length})
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {availableGear.map((g) => {
                  const selected = selectedGearIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGearTag(g.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        selected
                          ? 'bg-emerald-800 text-white border-emerald-800'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-emerald-400'
                      }`}
                    >
                      {g.title} •{' '}
                      {g.sharingType === 'FREE_LOAN'
                        ? 'Miễn phí'
                        : `${formatVnd(g.pricePerDay)}/ngày`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Media Upload Section */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-stone-700">
                Hình ảnh & Video chuyến đi ({mediaUrls.length}/6)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                onChange={handleFileSelect}
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
                Tải ảnh/video từ máy
              </Button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="url"
                  value={externalMediaUrl}
                  onChange={(e) => setExternalMediaUrl(e.target.value)}
                  placeholder="Hoặc dán URL hình ảnh / video (.mp4)..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddExternalUrl}
              >
                Thêm URL
              </Button>
            </div>

            {mediaUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {mediaUrls.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden bg-stone-200 border border-stone-300"
                  >
                    {isVideoUrl(url) ? (
                      <video
                        src={url}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setMediaUrls((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-white hover:bg-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting || uploading}
            >
              Đăng bài viết
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditPostModal: React.FC<{
  post: PostItem | null;
  onClose: () => void;
  onUpdated?: (updated: PostItem) => void;
}> = ({ post, onClose, onUpdated }) => {
  const queryClient = useQueryClient();
  const [content, setContent] = useState(post?.content || '');
  const [locationName, setLocationName] = useState(post?.locationName || '');
  const [activityType, setActivityType] = useState<ActivityType>(
    post?.activityType || 'TREKKING',
  );
  const [mediaUrls, setMediaUrls] = useState<string[]>(post?.mediaUrls || []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (post) {
      setContent(post.content);
      setLocationName(post.locationName || '');
      setActivityType(post.activityType || 'TREKKING');
      setMediaUrls(post.mediaUrls || []);
    }
  }, [post]);

  if (!post) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await socialService.updatePost(post.id, {
        content: content.trim(),
        locationName: locationName.trim(),
        activityType,
        mediaUrls,
      });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
      queryClient.invalidateQueries({ queryKey: ['post-detail', post.id] });
      onUpdated?.(updated);
      onClose();
    } catch (err: any) {
      const msg =
        err.response?.data?.message || 'Cập nhật bài viết không thành công';
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
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-xl w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 className="text-base font-bold text-stone-900">
            Chỉnh sửa bài viết
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
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Nội dung bài viết
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Địa điểm
              </label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Hoạt động
              </label>
              <select
                value={activityType}
                onChange={(e) =>
                  setActivityType(e.target.value as ActivityType)
                }
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300 bg-white"
              >
                {ACTIVITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
