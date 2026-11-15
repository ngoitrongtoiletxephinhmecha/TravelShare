import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Edit3,
  Eye,
  PauseCircle,
  PlayCircle,
  Plus,
  Tent,
} from 'lucide-react';
import { gearService } from '../services/gear.service';
import { useAuthStore } from '../store/auth.store';
import { GearStatus } from '../types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';
import { cn, formatVnd } from '../utils/format';

const STATUS_TABS: { value: GearStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hiển thị (ACTIVE)' },
  { value: 'DRAFT', label: 'Bản nháp (DRAFT)' },
  { value: 'PAUSED', label: 'Tạm ngừng (PAUSED)' },
  { value: 'UNAVAILABLE', label: 'Hết đồ (UNAVAILABLE)' },
  { value: 'ARCHIVED', label: 'Đã lưu trữ (ARCHIVED)' },
];

export const MyGearPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<GearStatus | 'ALL'>(
    'ALL',
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['my-gear', selectedStatus],
    queryFn: () =>
      gearService.getMyGearItems(
        selectedStatus === 'ALL' ? undefined : selectedStatus,
      ),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleStatusChange = async (gearId: string, nextStatus: GearStatus) => {
    setUpdatingId(gearId);
    try {
      await gearService.updateGearStatus(gearId, nextStatus);
      queryClient.invalidateQueries({ queryKey: ['my-gear'] });
      queryClient.invalidateQueries({ queryKey: ['gear-marketplace'] });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Quản lý Thiết bị của tôi (/my-gear)
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Theo dõi trạng thái, tạm ngừng cho thuê, chỉnh sửa hoặc lưu trữ các
            thiết bị bạn đã đăng
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/bookings/received">
            <Button variant="outline" size="md">
              Đơn thuê nhận được
            </Button>
          </Link>
          <Link to="/bookings/sent">
            <Button variant="secondary" size="md">
              Đơn tôi đi thuê
            </Button>
          </Link>
          <Link to="/gear/create">
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4" />
              Đăng thiết bị mới
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedStatus(tab.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors shrink-0',
              selectedStatus === tab.value
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Tent className="w-6 h-6" />}
          title="Chưa có thiết bị nào trong mục này"
          description="Bạn có thể đăng lều trại, balo, gậy trekking, đèn đội đầu hoặc lưu bản nháp để xuất bản sau."
          action={
            <Link to="/gear/create">
              <Button variant="primary" size="sm">
                Đăng thiết bị ngay
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((gear) => (
            <Card
              key={gear.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src={
                    gear.images?.[0] ||
                    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=300&auto=format&fit=crop&q=80'
                  }
                  alt={gear.title}
                  className="w-24 h-20 rounded-xl object-cover border border-stone-200 shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        gear.status === 'ACTIVE'
                          ? 'emerald'
                          : gear.status === 'PAUSED'
                            ? 'amber'
                            : 'stone'
                      }
                    >
                      {gear.status}
                    </Badge>
                    <Badge variant="stone">{gear.categoryName}</Badge>
                    {gear.isDemo && <Badge variant="demo">DEMO</Badge>}
                  </div>

                  <Link
                    to={`/gear/${gear.id}`}
                    className="text-sm font-bold text-stone-900 hover:text-emerald-700 block truncate"
                  >
                    {gear.title}
                  </Link>

                  <p className="text-xs text-stone-500">
                    Giá: <strong className="text-emerald-800">{formatVnd(gear.pricePerDay)}</strong> • Cọc: {formatVnd(gear.depositAmount)} • Khu vực: {gear.pickupAreaLabel}
                  </p>
                </div>
              </div>

              {/* Quick Management Actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link to={`/gear/${gear.id}`}>
                  <Button variant="ghost" size="sm">
                    <Eye className="w-3.5 h-3.5" />
                    Xem
                  </Button>
                </Link>

                <Link to={`/gear/${gear.id}/edit`}>
                  <Button variant="outline" size="sm">
                    <Edit3 className="w-3.5 h-3.5" />
                    Sửa
                  </Button>
                </Link>

                {gear.status !== 'ACTIVE' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={updatingId === gear.id}
                    onClick={() => handleStatusChange(gear.id, 'ACTIVE')}
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    Hiển thị (ACTIVE)
                  </Button>
                )}

                {gear.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={updatingId === gear.id}
                    onClick={() => handleStatusChange(gear.id, 'PAUSED')}
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    Tạm ngừng
                  </Button>
                )}

                {gear.status !== 'ARCHIVED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={updatingId === gear.id}
                    onClick={() => handleStatusChange(gear.id, 'ARCHIVED')}
                    title="Lưu trữ (Xóa mềm bảo toàn lịch sử giao dịch)"
                  >
                    <Archive className="w-3.5 h-3.5 text-stone-500" />
                    Lưu trữ
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
