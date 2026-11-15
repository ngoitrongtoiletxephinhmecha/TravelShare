import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Link2,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { gearService } from '../services/gear.service';
import { socialService } from '../services/social.service';
import { useAuthStore } from '../store/auth.store';
import { GearCondition, GearSharingType, GearStatus } from '../types';
import { Button, Card, Skeleton } from '../components/ui/DesignSystem';

const gearFormSchema = z
  .object({
    categoryCode: z.string().min(1, 'Vui lòng chọn danh mục thiết bị'),
    title: z
      .string()
      .min(5, 'Tên thiết bị cần ít nhất 5 ký tự')
      .max(160, 'Tên thiết bị tối đa 160 ký tự'),
    description: z
      .string()
      .min(15, 'Mô tả thiết bị cần ít nhất 15 ký tự')
      .max(4000, 'Mô tả tối đa 4000 ký tự'),
    brand: z.string().max(80).optional(),
    condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
    totalQuantity: z.coerce.number().int().min(1).max(50),
    sharingType: z.enum(['RENT', 'FREE_LOAN', 'BOTH']),
    pricePerDay: z.coerce.number().min(0, 'Giá thuê không được âm'),
    depositAmount: z.coerce.number().min(0, 'Tiền cọc không được âm'),
    city: z.string().min(2, 'Vui lòng chọn Tỉnh/Thành phố'),
    district: z.string().min(2, 'Vui lòng nhập Quận/Huyện nhận đồ'),
    minRentalDays: z.coerce.number().int().min(1).max(30),
    maxRentalDays: z.coerce.number().int().min(1).max(60),
    advanceNoticeHours: z.coerce.number().int().min(0).max(168),
    usageRulesText: z.string().optional(),
  })
  .superRefine((vals, ctx) => {
    if (vals.sharingType === 'FREE_LOAN' && vals.pricePerDay > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricePerDay'],
        message: 'Thiết bị cho mượn miễn phí phải có giá thuê bằng 0 VND',
      });
    }
    if (
      (vals.sharingType === 'RENT' || vals.sharingType === 'BOTH') &&
      vals.pricePerDay <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricePerDay'],
        message: 'Hình thức cho thuê bắt buộc phải có giá thuê lớn hơn 0 VND/ngày',
      });
    }
  });

type GearFormValues = z.infer<typeof gearFormSchema>;

export const GearFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [images, setImages] = useState<string[]>([]);
  const [externalImgUrl, setExternalImgUrl] = useState('');
  const [attributes, setAttributes] = useState<
    Record<string, string | number | boolean>
  >({});
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['gear-categories'],
    queryFn: () => gearService.getCategories(),
  });

  const { data: existingGear, isLoading: loadingGear } = useQuery({
    queryKey: ['gear-detail', id],
    queryFn: () => gearService.getGearById(id!),
    enabled: isEditMode,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GearFormValues>({
    resolver: zodResolver(gearFormSchema),
    defaultValues: {
      categoryCode: 'TENT',
      title: '',
      description: '',
      brand: '',
      condition: 'GOOD',
      totalQuantity: 1,
      sharingType: 'RENT',
      pricePerDay: 80000,
      depositAmount: 300000,
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      minRentalDays: 1,
      maxRentalDays: 14,
      advanceNoticeHours: 4,
      usageRulesText: 'Giữ gìn vệ sinh sạch sẽ\nBàn giao đúng giờ đã hẹn',
    },
  });

  const watchedCategoryCode = watch('categoryCode');
  const watchedSharingType = watch('sharingType');

  useEffect(() => {
    if (watchedSharingType === 'FREE_LOAN') {
      setValue('pricePerDay', 0);
    }
  }, [watchedSharingType, setValue]);

  useEffect(() => {
    if (existingGear && isEditMode) {
      reset({
        categoryCode: existingGear.categoryCode,
        title: existingGear.title,
        description: existingGear.description,
        brand: existingGear.brand || '',
        condition: existingGear.condition as GearCondition,
        totalQuantity: existingGear.totalQuantity || 1,
        sharingType: existingGear.sharingType as GearSharingType,
        pricePerDay: existingGear.pricePerDay,
        depositAmount: existingGear.depositAmount,
        city: existingGear.city,
        district: existingGear.district,
        minRentalDays:
          existingGear.availabilitySettings?.minRentalDays || 1,
        maxRentalDays:
          existingGear.availabilitySettings?.maxRentalDays || 14,
        advanceNoticeHours:
          existingGear.availabilitySettings?.advanceNoticeHours ?? 4,
        usageRulesText: (existingGear.usageRules || []).join('\n'),
      });
      setImages(existingGear.images || []);
      setAttributes(existingGear.attributes || {});
    }
  }, [existingGear, isEditMode, reset]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isEditMode && loadingGear) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const activeCategory = categories.find(
    (c) => c.code === watchedCategoryCode,
  );
  const dynamicFields = activeCategory?.attributesSchema || [];

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setServerError(null);
    setUploading(true);
    try {
      const uploaded = await socialService.uploadMedia(files);
      setImages((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Upload ảnh không thành công';
      setServerError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddExternalUrl = () => {
    const trimmed = externalImgUrl.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('data:')) {
      setServerError('Không cho phép dán chuỗi base64 trực tiếp.');
      return;
    }
    setImages((prev) => [...prev, trimmed]);
    setExternalImgUrl('');
  };

  const submitWithStatus = (targetStatus: GearStatus) =>
    handleSubmit(async (values) => {
      setServerError(null);
      try {
        const usageRules = (values.usageRulesText || '')
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean);

        const payload = {
          categoryCode: values.categoryCode,
          title: values.title,
          description: values.description,
          brand: values.brand,
          condition: values.condition,
          attributes,
          images,
          totalQuantity: values.totalQuantity,
          sharingType: values.sharingType,
          pricePerDay:
            values.sharingType === 'FREE_LOAN' ? 0 : values.pricePerDay,
          depositAmount: values.depositAmount,
          city: values.city,
          district: values.district,
          usageRules,
          availabilitySettings: {
            minRentalDays: values.minRentalDays,
            maxRentalDays: values.maxRentalDays,
            advanceNoticeHours: values.advanceNoticeHours,
          },
          status: targetStatus,
        };

        const saved = isEditMode
          ? await gearService.updateGear(id!, payload)
          : await gearService.createGear(payload);

        queryClient.invalidateQueries({ queryKey: ['gear-marketplace'] });
        queryClient.invalidateQueries({ queryKey: ['my-gear'] });
        navigate(
          targetStatus === 'DRAFT' ? '/my-gear' : `/gear/${saved.id}`,
        );
      } catch (err: any) {
        const msg =
          err.response?.data?.message || 'Lưu thiết bị không thành công';
        setServerError(Array.isArray(msg) ? msg.join(', ') : msg);
      }
    })();

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/gear"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Chợ Thiết Bị
        </Link>
      </div>

      <Card className="p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            {isEditMode
              ? 'Chỉnh sửa thông tin thiết bị'
              : 'Đăng thiết bị du lịch lên TravelShare'}
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Chia sẻ lều trại, balo, gậy trekking, đèn đội đầu... để cho thuê
            hoặc cho mượn miễn phí tới cộng đồng
          </p>
        </div>

        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {/* Category & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Danh mục thiết bị *
              </label>
              <select
                {...register('categoryCode')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 bg-white"
              >
                {categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Thương hiệu / Hãng sản xuất
              </label>
              <input
                type="text"
                placeholder="VD: Naturehike, Osprey, Black Diamond, Decathlon"
                {...register('brand')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Tên thiết bị *
            </label>
            <input
              type="text"
              placeholder="VD: Lều Naturehike Cloud Up 2 (2 người, chống mưa PU4000mm)"
              {...register('title')}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300"
            />
            {errors.title && (
              <p className="text-xs text-red-600 mt-1">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Condition & Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tình trạng thực tế *
              </label>
              <select
                {...register('condition')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 bg-white"
              >
                <option value="NEW">Mới 100% (Chưa bóc tem)</option>
                <option value="LIKE_NEW">Như mới (95-99%)</option>
                <option value="GOOD">Tốt (Sử dụng hoàn hảo)</option>
                <option value="FAIR">Khá (Có vết xước nhẹ)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Số lượng thiết bị có sẵn *
              </label>
              <input
                type="number"
                min={1}
                max={50}
                {...register('totalQuantity')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300"
              />
            </div>
          </div>

          {/* Dynamic Category Attributes */}
          {dynamicFields.length > 0 && (
            <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-3">
              <p className="text-xs font-bold text-emerald-900">
                Thuộc tính đặc thù cho danh mục: {activeCategory?.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dynamicFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      {field.label}
                    </label>
                    {field.type === 'boolean' ? (
                      <select
                        value={String(Boolean(attributes[field.key]))}
                        onChange={(e) =>
                          setAttributes((prev) => ({
                            ...prev,
                            [field.key]: e.target.value === 'true',
                          }))
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white"
                      >
                        <option value="true">Có</option>
                        <option value="false">Không</option>
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        step="any"
                        value={String(attributes[field.key] ?? '')}
                        onChange={(e) =>
                          setAttributes((prev) => ({
                            ...prev,
                            [field.key]:
                              field.type === 'number'
                                ? Number(e.target.value)
                                : e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Mô tả chi tiết & Phụ kiện đi kèm *
            </label>
            <textarea
              rows={4}
              placeholder="Mô tả chi tiết tình trạng, phụ kiện kèm theo (cọc lều, tấm lót, áo mưa balo...), phù hợp cung đường nào..."
              {...register('description')}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300"
            />
            {errors.description && (
              <p className="text-xs text-red-600 mt-1">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Sharing Type, Price & Deposit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Hình thức chia sẻ *
              </label>
              <select
                {...register('sharingType')}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 bg-white"
              >
                <option value="RENT">Cho thuê có phí (RENT)</option>
                <option value="FREE_LOAN">Cho mượn miễn phí (FREE_LOAN)</option>
                <option value="BOTH">Linh hoạt Thuê / Mượn (BOTH)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Giá thuê / ngày (VND) *
              </label>
              <input
                type="number"
                min={0}
                step={5000}
                disabled={watchedSharingType === 'FREE_LOAN'}
                {...register('pricePerDay')}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 disabled:bg-stone-200"
              />
              {errors.pricePerDay && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.pricePerDay.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tiền cọc dự kiến (VND) *
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                {...register('depositAmount')}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-300"
              />
              {errors.depositAmount && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.depositAmount.message}
                </p>
              )}
            </div>
          </div>

          {/* Pickup Area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tỉnh / Thành phố nhận đồ *
              </label>
              <input
                type="text"
                placeholder="VD: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng"
                {...register('city')}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
              {errors.city && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.city.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Quận / Huyện (Vị trí gần đúng) *
              </label>
              <input
                type="text"
                placeholder="VD: Cầu Giấy, Đống Đa, Thanh Xuân"
                {...register('district')}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
              {errors.district && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.district.message}
                </p>
              )}
            </div>
          </div>

          {/* Availability Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Thuê tối thiểu (ngày)
              </label>
              <input
                type="number"
                min={1}
                {...register('minRentalDays')}
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Thuê tối đa (ngày)
              </label>
              <input
                type="number"
                min={1}
                {...register('maxRentalDays')}
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Báo trước tối thiểu (giờ)
              </label>
              <input
                type="number"
                min={0}
                {...register('advanceNoticeHours')}
                className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
          </div>

          {/* Usage Rules */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Quy định sử dụng (Mỗi dòng 1 quy định)
            </label>
            <textarea
              rows={3}
              {...register('usageRulesText')}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
            />
          </div>

          {/* Images Upload */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">
                Ảnh thực tế thiết bị ({images.length})
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadFiles}
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
                Tải ảnh lên
              </Button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="url"
                  value={externalImgUrl}
                  onChange={(e) => setExternalImgUrl(e.target.value)}
                  placeholder="Hoặc dán URL hình ảnh thiết bị..."
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

            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                {images.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden border border-stone-300 bg-stone-100"
                  >
                    <img
                      src={url}
                      alt="Gear preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Action Buttons: Save Draft or Publish */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              isLoading={isSubmitting}
              onClick={() => submitWithStatus('DRAFT')}
            >
              <Save className="w-4 h-4" />
              Lưu bản nháp (DRAFT)
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isSubmitting}
              onClick={() => submitWithStatus('ACTIVE')}
            >
              <Send className="w-4 h-4" />
              {isEditMode
                ? 'Cập nhật & Xuất bản (ACTIVE)'
                : 'Xuất bản thiết bị (ACTIVE)'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
