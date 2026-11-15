import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  LocateFixed,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tent,
  X,
} from 'lucide-react';
import { gearService } from '../services/gear.service';
import { GearCondition, GearSharingType } from '../types';
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';
import {
  CONDITION_LABELS,
  GearCard,
  SHARING_TYPE_LABELS,
} from '../components/gear/GearCard';
import { useAuthStore } from '../store/auth.store';
import { cn } from '../utils/format';

const PRESET_LOCATIONS: {
  label: string;
  city: string;
  lng?: number;
  lat?: number;
}[] = [
  { label: 'Tất cả khu vực', city: '' },
  {
    label: 'Cầu Giấy, Hà Nội (Bán kính GPS)',
    city: 'Hà Nội',
    lng: 105.7906,
    lat: 21.0362,
  },
  {
    label: 'Đống Đa, Hà Nội (Bán kính GPS)',
    city: 'Hà Nội',
    lng: 105.827,
    lat: 21.018,
  },
  {
    label: 'Hoàn Kiếm, Hà Nội (Bán kính GPS)',
    city: 'Hà Nội',
    lng: 105.8525,
    lat: 21.0285,
  },
  {
    label: 'TP. Hồ Chí Minh',
    city: 'TP. Hồ Chí Minh',
    lng: 106.6602,
    lat: 10.7626,
  },
  { label: 'Đà Nẵng', city: 'Đà Nẵng', lng: 108.2022, lat: 16.0544 },
];

export const GearMarketplacePage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [submittedKeyword, setSubmittedKeyword] = useState(
    searchParams.get('q') || '',
  );
  const [categoryCode, setCategoryCode] = useState<string>('ALL');
  const [sharingType, setSharingType] = useState<GearSharingType | ''>('');
  const [condition, setCondition] = useState<GearCondition | ''>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [selectedLocationIdx, setSelectedLocationIdx] = useState<number>(0);
  const [customCoords, setCustomCoords] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [startAt, setStartAt] = useState<string>('');
  const [endAt, setEndAt] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    'newest' | 'price_asc' | 'price_desc' | 'distance'
  >('newest');
  const [page, setPage] = useState<number>(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['gear-categories'],
    queryFn: () => gearService.getCategories(),
  });

  const activePreset = PRESET_LOCATIONS[selectedLocationIdx];
  const activeLng = customCoords?.lng ?? activePreset?.lng;
  const activeLat = customCoords?.lat ?? activePreset?.lat;

  const {
    data: searchResult,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'gear-marketplace',
      {
        q: submittedKeyword,
        categoryCode,
        sharingType,
        condition,
        minPrice,
        maxPrice,
        city: customCoords ? undefined : activePreset?.city,
        lng: activeLng,
        lat: activeLat,
        radiusKm: activeLng !== undefined ? radiusKm : undefined,
        startAt: startAt || undefined,
        endAt: endAt || undefined,
        sortBy,
        page,
      },
    ],
    queryFn: () =>
      gearService.searchGear({
        q: submittedKeyword || undefined,
        categoryCode: categoryCode === 'ALL' ? undefined : categoryCode,
        sharingType: sharingType || undefined,
        condition: condition || undefined,
        minPrice: minPrice !== '' ? Number(minPrice) : undefined,
        maxPrice: maxPrice !== '' ? Number(maxPrice) : undefined,
        city:
          !customCoords && activePreset?.city ? activePreset.city : undefined,
        lng: activeLng,
        lat: activeLat,
        radiusKm: activeLng !== undefined ? radiusKm : undefined,
        startAt: startAt || undefined,
        endAt: endAt || undefined,
        sortBy,
        page,
        limit: 12,
      }),
  });

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomCoords({
          lng: Number(pos.coords.longitude.toFixed(4)),
          lat: Number(pos.coords.latitude.toFixed(4)),
        });
        setSortBy('distance');
        setPage(1);
      },
      () => {
        // Fallback to Hanoi center if geolocation permission denied
        setSelectedLocationIdx(1);
        setSortBy('distance');
      },
    );
  };

  const resetFilters = () => {
    setKeyword('');
    setSubmittedKeyword('');
    setCategoryCode('ALL');
    setSharingType('');
    setCondition('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedLocationIdx(0);
    setCustomCoords(null);
    setRadiusKm(25);
    setStartAt('');
    setEndAt('');
    setSortBy('newest');
    setPage(1);
  };

  const renderFilterControls = () => (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
        <span className="font-bold uppercase tracking-wider text-stone-700">
          Bộ lọc thiết bị
        </span>
        <button
          type="button"
          onClick={resetFilters}
          className="text-emerald-700 font-semibold hover:underline"
        >
          Đặt lại
        </button>
      </div>

      {/* Sharing Type */}
      <div>
        <label className="block font-semibold text-stone-700 mb-1.5">
          Hình thức chia sẻ
        </label>
        <select
          value={sharingType}
          onChange={(e) => {
            setSharingType(e.target.value as GearSharingType | '');
            setPage(1);
          }}
          className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs"
        >
          <option value="">Tất cả (Thuê & Mượn miễn phí)</option>
          {(Object.keys(SHARING_TYPE_LABELS) as GearSharingType[]).map((k) => (
            <option key={k} value={k}>
              {SHARING_TYPE_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Price Range */}
      <div>
        <label className="block font-semibold text-stone-700 mb-1.5">
          Khoảng giá thuê (VND/ngày)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            step={10000}
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value);
              setPage(1);
            }}
            placeholder="Từ (0)"
            className="w-full px-2.5 py-2 rounded-xl border border-stone-300"
          />
          <input
            type="number"
            min={0}
            step={10000}
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value);
              setPage(1);
            }}
            placeholder="Đến (500.000)"
            className="w-full px-2.5 py-2 rounded-xl border border-stone-300"
          />
        </div>
      </div>

      {/* Geolocation & Radius */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-stone-700">
            Khu vực & Bán kính
          </label>
          <button
            type="button"
            onClick={handleUseBrowserGps}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
          >
            <LocateFixed className="w-3 h-3" />
            Vị trí của tôi
          </button>
        </div>

        <select
          value={selectedLocationIdx}
          onChange={(e) => {
            setCustomCoords(null);
            setSelectedLocationIdx(Number(e.target.value));
            setPage(1);
          }}
          className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
        >
          {PRESET_LOCATIONS.map((loc, idx) => (
            <option key={loc.label} value={idx}>
              {loc.label}
            </option>
          ))}
        </select>

        {activeLng !== undefined && (
          <div className="pt-1">
            <div className="flex justify-between text-[11px] text-stone-600 mb-1">
              <span>Bán kính tìm kiếm:</span>
              <span className="font-bold text-emerald-800">{radiusKm} km</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={radiusKm}
              onChange={(e) => {
                setRadiusKm(Number(e.target.value));
                setPage(1);
              }}
              className="w-full accent-emerald-700"
            />
          </div>
        )}
      </div>

      {/* Availability Date Interval [startAt, endAt) */}
      <div className="space-y-2 pt-2 border-t border-stone-100">
        <label className="block font-semibold text-stone-700">
          <Calendar className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
          Lọc theo ngày còn trống
        </label>
        <div>
          <span className="text-[11px] text-stone-500 block mb-0.5">
            Ngày nhận đồ (startAt):
          </span>
          <input
            type="date"
            value={startAt}
            onChange={(e) => {
              setStartAt(e.target.value);
              setPage(1);
            }}
            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300"
          />
        </div>
        <div>
          <span className="text-[11px] text-stone-500 block mb-0.5">
            Ngày trả đồ (endAt):
          </span>
          <input
            type="date"
            value={endAt}
            onChange={(e) => {
              setEndAt(e.target.value);
              setPage(1);
            }}
            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300"
          />
        </div>
      </div>

      {/* Condition */}
      <div className="pt-2 border-t border-stone-100">
        <label className="block font-semibold text-stone-700 mb-1.5">
          Tình trạng thiết bị
        </label>
        <select
          value={condition}
          onChange={(e) => {
            setCondition(e.target.value as GearCondition | '');
            setPage(1);
          }}
          className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
        >
          <option value="">Tất cả tình trạng</option>
          {(Object.keys(CONDITION_LABELS) as GearCondition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Marketplace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Tent className="w-6 h-6 text-emerald-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900">
              Chợ Chia Sẻ & Thuê Mượn Thiết Bị Du Lịch
            </h1>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Tìm kiếm lều trại, balo, gậy trekking, đèn đội đầu quanh khu vực của
            bạn hoặc chia sẻ đồ dùng chưa sử dụng tới cộng đồng
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAuthenticated && (
            <Link to="/my-gear">
              <Button variant="outline" size="md">
                <PackageOpen className="w-4 h-4" />
                Thiết bị của tôi
              </Button>
            </Link>
          )}
          <Link to={isAuthenticated ? '/gear/create' : '/login'}>
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4" />
              Đăng thiết bị
            </Button>
          </Link>
        </div>
      </div>

      {/* Search Bar & Sort Row */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedKeyword(keyword.trim());
              setPage(1);
            }}
            className="flex flex-1 gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm tên thiết bị (Naturehike, Osprey, Black Diamond), khu vực..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="primary">
              Tìm kiếm
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-stone-300 bg-white"
            >
              <option value="newest">Sắp xếp: Mới nhất</option>
              <option value="price_asc">Giá thuê: Thấp → Cao</option>
              <option value="price_desc">Giá thuê: Cao → Thấp</option>
              <option value="distance">Khoảng cách gần nhất</option>
            </select>

            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 bg-white"
            >
              <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
              Bộ lọc
            </button>
          </div>
        </div>

        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setCategoryCode('ALL');
              setPage(1);
            }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors shrink-0',
              categoryCode === 'ALL'
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-emerald-50',
            )}
          >
            Tất cả ({categories.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.code}
              type="button"
              onClick={() => {
                setCategoryCode(cat.code);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0',
                categoryCode === cat.code
                  ? 'bg-emerald-800 text-white border-emerald-800 font-semibold'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-emerald-50 hover:text-emerald-800',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Main Grid Layout: Desktop Left Sidebar Filter (3 cols) + Gear Grid (9 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="hidden lg:block lg:col-span-3 sticky top-20">
          <Card className="p-4">{renderFilterControls()}</Card>
        </aside>

        <section className="lg:col-span-9 space-y-5">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Card key={n} className="p-4 space-y-3">
                  <Skeleton className="h-44 w-full rounded-xl" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                </Card>
              ))}
            </div>
          ) : isError ? (
            <Card className="p-8 text-center space-y-3">
              <p className="text-sm font-bold text-stone-900">
                Không thể tải danh sách thiết bị hoặc khoảng ngày lọc không hợp lệ
              </p>
              <p className="text-xs text-stone-500">
                Hãy kiểm tra lại ngày bắt đầu &lt; ngày kết thúc hoặc kết nối
                máy chủ Backend.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-3.5 h-3.5" />
                Thử lại
              </Button>
            </Card>
          ) : !searchResult || searchResult.items.length === 0 ? (
            <EmptyState
              icon={<Tent className="w-6 h-6" />}
              title="Không tìm thấy thiết bị phù hợp"
              description="Chưa có thiết bị nào khớp với bộ lọc hiện tại. Hãy thử mở rộng bán kính tìm kiếm hoặc đặt lại bộ lọc."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Xóa bộ lọc
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>
                  Tìm thấy{' '}
                  <strong className="text-stone-900">
                    {searchResult.total}
                  </strong>{' '}
                  thiết bị đang hoạt động
                </span>
                <span>
                  Trang {searchResult.page}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {searchResult.items.map((item) => (
                  <GearCard key={item.id} gear={item} />
                ))}
              </div>

              {/* Pagination Controls */}
              {(searchResult.page > 1 || searchResult.hasMore) && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </Button>
                  <span className="text-xs font-semibold text-stone-700">
                    Trang {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!searchResult.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Trang tiếp theo
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex justify-end lg:hidden"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            className="w-80 max-w-full bg-white h-full p-5 overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">
                Lọc thiết bị du lịch
              </h3>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterControls()}
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setMobileFilterOpen(false)}
            >
              Áp dụng bộ lọc
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
