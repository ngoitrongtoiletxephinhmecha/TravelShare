import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  Plus,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { communityService, CommunitySummary } from '../services/community.service';
import { useAuthStore } from '../store/auth.store';
import { ActivityType } from '../types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'TREKKING', label: 'Trekking / Leo núi' },
  { value: 'CAMPING', label: 'Camping / Dã ngoại' },
  { value: 'MOTORBIKE_TOUR', label: 'Phượt xe máy' },
  { value: 'BACKPACKING', label: 'Du lịch bụi' },
  { value: 'MOUNTAINEERING', label: 'Chinh phục đỉnh cao' },
  { value: 'BEACH_CAMPING', label: 'Cắm trại biển' },
  { value: 'OTHER', label: 'Khác' },
];

export const CommunitiesPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [joinedOnly, setJoinedOnly] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [page, setPage] = useState(1);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newActivity, setNewActivity] = useState<ActivityType>('TREKKING');
  const [rulesText, setRulesText] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['communities', { search, joinedOnly, activityType, page }],
    queryFn: () =>
      communityService.listCommunities({
        q: search.trim() || undefined,
        joinedOnly: joinedOnly || undefined,
        activityType: activityType || undefined,
        page,
        limit: 9,
      }),
  });

  const handleToggleJoin = async (community: CommunitySummary) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setBusySlug(community.slug);
    try {
      if (community.isJoined) {
        await communityService.leaveCommunity(community.slug);
      } else {
        await communityService.joinCommunity(community.slug);
      }
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({
        queryKey: ['community-detail', community.slug],
      });
    } catch (err: any) {
      window.alert(
        err.response?.data?.message ||
          'Không thể cập nhật trạng thái tham gia cộng đồng.',
      );
    } finally {
      setBusySlug(null);
    }
  };

  const handleCreateCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('Vui lòng nhập tên cộng đồng.');
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const rules = rulesText
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const created = await communityService.createCommunity({
        name: name.trim(),
        description: description.trim() || undefined,
        activityType: newActivity,
        rules,
      });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
      setRulesText('');
      navigate(`/communities/${created.slug}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Tạo cộng đồng thất bại.';
      setCreateError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Cộng đồng Du lịch & Khám phá
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Tham gia nhóm theo sở thích, chia sẻ kinh nghiệm cung đường và đánh
            giá thiết bị thực tế.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => {
            if (!isAuthenticated) {
              navigate('/login');
              return;
            }
            setCreateOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Tạo cộng đồng
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm cộng đồng theo tên hoặc mô tả..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <select
          value={activityType}
          onChange={(e) => {
            setActivityType(e.target.value as ActivityType | '');
            setPage(1);
          }}
          className="px-3 py-2 text-sm rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-emerald-600"
        >
          <option value="">Tất cả chủ đề</option>
          {ACTIVITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {isAuthenticated && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 px-3 py-2 rounded-xl border border-stone-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={joinedOnly}
              onChange={(e) => {
                setJoinedOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded text-emerald-700 focus:ring-emerald-600"
            />
            Đã tham gia
          </label>
        )}
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-5 space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="Chưa tìm thấy cộng đồng phù hợp"
          description="Thử từ khóa khác hoặc tạo cộng đồng mới cho hành trình của bạn."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.items.map((c) => (
              <Card
                key={c.id}
                className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <Link
                    to={`/communities/${c.slug}`}
                    className="block h-32 bg-gradient-to-br from-emerald-800 to-teal-900 relative"
                  >
                    {c.coverUrl && (
                      <img
                        src={c.coverUrl}
                        alt={c.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <Badge variant="emerald">{c.activityType}</Badge>
                      {c.myRole && (
                        <Badge variant="stone">
                          <Shield className="w-3 h-3" />
                          {c.myRole}
                        </Badge>
                      )}
                    </div>
                  </Link>

                  <div className="p-4 space-y-2">
                    <Link
                      to={`/communities/${c.slug}`}
                      className="text-base font-bold text-stone-900 hover:text-emerald-700 block truncate"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-stone-600 line-clamp-2 min-h-[2rem]">
                      {c.description ||
                        'Không gian chia sẻ kinh nghiệm và thiết bị du lịch.'}
                    </p>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-500 inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-700" />
                    {c.membersCount} thành viên
                  </span>

                  <div className="flex items-center gap-2">
                    <Link to={`/communities/${c.slug}`}>
                      <Button variant="ghost" size="sm">
                        Xem
                      </Button>
                    </Link>
                    <Button
                      variant={c.isJoined ? 'outline' : 'primary'}
                      size="sm"
                      isLoading={busySlug === c.slug}
                      onClick={() => handleToggleJoin(c)}
                    >
                      {c.isJoined ? 'Rời nhóm' : 'Tham gia'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </Button>
              <span className="text-xs text-stone-600 px-2">
                Trang {data.page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Community Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-700" />
                <h2 className="text-base font-bold text-stone-900">
                  Tạo cộng đồng mới
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCommunity} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Tên cộng đồng
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Trekking Tà Năng - Phan Dũng"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Chủ đề hoạt động
                </label>
                <select
                  value={newActivity}
                  onChange={(e) =>
                    setNewActivity(e.target.value as ActivityType)
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-emerald-600"
                >
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Giới thiệu mục tiêu và hoạt động của cộng đồng..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nội quy cộng đồng (mỗi dòng 1 quy tắc)
                </label>
                <textarea
                  rows={3}
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  placeholder="Không spam bán hàng&#10;Tôn trọng thành viên khác&#10;Chia sẻ thông tin cung đường chính xác"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600 resize-none"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={creating}
                >
                  Tạo cộng đồng
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
