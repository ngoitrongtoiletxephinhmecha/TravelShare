import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, ShieldCheck, Tent } from 'lucide-react';
import { GearCondition, GearItemData, GearSharingType } from '../../types';
import { Badge, Button, Card } from '../ui/DesignSystem';
import { formatVnd } from '../../utils/format';

export const CONDITION_LABELS: Record<GearCondition, string> = {
  NEW: 'Mới 100%',
  LIKE_NEW: 'Như mới (95%)',
  GOOD: 'Tốt (Dùng ổn định)',
  FAIR: 'Khá (Đã qua sử dụng)',
};

export const SHARING_TYPE_LABELS: Record<GearSharingType, string> = {
  RENT: 'Cho thuê',
  FREE_LOAN: 'Cho mượn miễn phí',
  BOTH: 'Thuê / Mượn',
};

export const GearCard: React.FC<{ gear: GearItemData }> = ({ gear }) => {
  const coverImage =
    gear.images?.[0] ||
    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=80';

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <Link
        to={`/gear/${gear.id}`}
        className="aspect-[16/10] bg-stone-100 relative block overflow-hidden group"
      >
        <img
          src={coverImage}
          alt={gear.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />

        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {gear.isDemo && <Badge variant="demo">DEMO</Badge>}
          <Badge variant="emerald">{gear.categoryName}</Badge>
          {gear.sharingType === 'FREE_LOAN' && (
            <Badge variant="amber">Mượn miễn phí</Badge>
          )}
        </div>

        <div className="absolute bottom-2.5 right-2.5">
          <span className="px-2 py-0.5 rounded-md bg-stone-900/75 text-white text-[11px] font-medium">
            {CONDITION_LABELS[gear.condition] || gear.condition}
          </span>
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <Link
            to={`/gear/${gear.id}`}
            className="text-sm font-bold text-stone-900 hover:text-emerald-700 line-clamp-2"
          >
            {gear.title}
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-stone-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              {gear.pickupAreaLabel}
            </span>
            {gear.distanceKm !== null && gear.distanceKm !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
                <Navigation className="w-3 h-3" />
                Cách ~{gear.distanceKm} km
              </span>
            )}
          </div>

          {gear.brand && (
            <p className="text-[11px] text-stone-400">
              Thương hiệu: <span className="font-medium text-stone-600">{gear.brand}</span> • Số lượng: {gear.totalQuantity}
            </p>
          )}
        </div>

        {/* Owner Info */}
        <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
          <Link
            to={`/users/${gear.owner.username}`}
            className="flex items-center gap-2 min-w-0 hover:text-emerald-700"
          >
            <img
              src={
                gear.owner.avatarUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(gear.owner.fullName)}&background=166534&color=fff`
              }
              alt={gear.owner.fullName}
              className="w-6 h-6 rounded-full object-cover border border-stone-200 shrink-0"
            />
            <span className="text-xs font-medium text-stone-700 truncate">
              {gear.owner.fullName}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 font-semibold shrink-0">
              <ShieldCheck className="w-3 h-3" />
              {gear.owner.trustScore}
            </span>
          </Link>
        </div>

        {/* Price & Action */}
        <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-emerald-800">
              {formatVnd(gear.pricePerDay)}
              {gear.pricePerDay > 0 && (
                <span className="text-xs font-normal text-stone-500">
                  /ngày
                </span>
              )}
            </p>
            <p className="text-[11px] text-stone-400">
              Cọc: {formatVnd(gear.depositAmount)}
            </p>
          </div>

          <Link to={`/gear/${gear.id}`}>
            <Button size="sm" variant="secondary">
              <Tent className="w-3.5 h-3.5" />
              Chi tiết
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
};
