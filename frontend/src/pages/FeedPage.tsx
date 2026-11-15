import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  CheckSquare,
  Compass,
  Hash,
  MapPin,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Tent,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  Skeleton,
  SystemStatusWidget,
} from '../components/ui/DesignSystem';
import { useAuthStore } from '../store/auth.store';
import { socialService } from '../services/social.service';
import { PostFeed } from '../components/social/PostFeed';
import { CreatePostModal } from '../components/social/PostModals';
import { FollowButton } from '../components/social/SocialButtons';
import { cn } from '../utils/format';

export const FeedPage: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const [feedType, setFeedType] = useState<
    'latest' | 'following' | 'featured' | 'saved'
  >('latest');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: trendingTags = [] } = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: () => socialService.getTrendingHashtags(),
  });

  const { data: suggestedUsers = [], isLoading: loadingSuggested } = useQuery({
    queryKey: ['suggested-users'],
    queryFn: () => socialService.getSuggestedUsers(),
  });

  const handleOpenCreate = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setCreateModalOpen(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Sidebar (3 cols on Desktop) */}
      <aside className="hidden lg:block lg:col-span-3 space-y-5 sticky top-20">
        <Card className="p-4">
          {isAuthenticated && user ? (
            <Link
              to={`/users/${user.profile?.username || user.id}`}
              className="flex items-center gap-3 pb-4 mb-4 border-b border-stone-100 group"
            >
              <img
                src={
                  user.profile?.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user.profile?.fullName || user.email)}&background=166534&color=fff`
                }
                alt={user.profile?.fullName}
                className="w-11 h-11 rounded-full object-cover border border-emerald-200"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-stone-900 group-hover:text-emerald-700 truncate">
                  {user.profile?.fullName}
                </p>
                <p className="text-xs text-stone-500 truncate">
                  @{user.profile?.username} • Uy tín{' '}
                  {user.profile?.trustScore ?? 5.0}★
                </p>
              </div>
            </Link>
          ) : (
            <div className="pb-4 mb-4 border-b border-stone-100">
              <p className="text-sm font-semibold text-stone-900 mb-1">
                Chào mừng đến TravelShare
              </p>
              <p className="text-xs text-stone-500 mb-3">
                Đăng nhập để chia sẻ chuyến đi, mượn thiết bị và tạo checklist
                cùng AI.
              </p>
              <Link to="/login">
                <Button variant="primary" size="sm" className="w-full">
                  Đăng nhập ngay
                </Button>
              </Link>
            </div>
          )}

          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">
            Lối tắt hệ sinh thái
          </p>
          <ul className="space-y-1 text-sm">
            <li>
              <Link
                to="/ai-assistant"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition-colors"
              >
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <span>AI Tư vấn & Tạo Checklist</span>
              </Link>
            </li>
            <li>
              <Link
                to="/gear"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition-colors"
              >
                <Tent className="w-4 h-4 text-emerald-700" />
                <span>Chợ Thuê & Mượn Thiết Bị</span>
              </Link>
            </li>
            <li>
              <Link
                to="/explore"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition-colors"
              >
                <Compass className="w-4 h-4 text-emerald-700" />
                <span>Khám phá Cung Đường</span>
              </Link>
            </li>
            <li>
              <Link
                to="/communities"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition-colors"
              >
                <Users className="w-4 h-4 text-emerald-700" />
                <span>Cộng đồng Du lịch</span>
              </Link>
            </li>
          </ul>
        </Card>

        {/* Trending Hashtags Card */}
        <Card className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Hash className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              Hashtag Xu Hướng
            </h3>
          </div>
          {trendingTags.length === 0 ? (
            <p className="text-xs text-stone-400">
              Chưa có hashtag xu hướng nào.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {trendingTags.map((item) => (
                <Link
                  key={item.tag}
                  to={`/explore?hashtag=${encodeURIComponent(item.tag.replace(/^#/, ''))}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-emerald-50 text-xs font-medium text-stone-700 hover:text-emerald-800 transition-colors"
                >
                  <span>{item.tag}</span>
                  <span className="text-[10px] text-stone-400">
                    ({item.postsCount})
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </aside>

      {/* Center Column: Create Post Composer & Infinite Scroll Feed (6 cols on Desktop) */}
      <section className="lg:col-span-6 space-y-5">
        {/* Create Post Composer Trigger */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold shrink-0">
              {user?.profile?.fullName?.[0] || 'T'}
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex-1 text-left rounded-xl bg-stone-100 hover:bg-stone-200/70 px-4 py-2.5 text-sm text-stone-500 transition-colors"
            >
              {isAuthenticated
                ? `Chia sẻ trải nghiệm chuyến đi hoặc hình ảnh của bạn, ${user?.profile?.fullName}...`
                : 'Bạn vừa đi trekking hay camping ở đâu? Đăng bài chia sẻ ngay...'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-3 border-t border-stone-100">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                <Camera className="w-4 h-4 text-emerald-700" />
                Ảnh / Video
              </button>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                <MapPin className="w-4 h-4 text-emerald-700" />
                Địa điểm
              </button>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                <Hash className="w-4 h-4 text-emerald-700" />
                Hashtag
              </button>
            </div>
            <Button size="sm" variant="primary" onClick={handleOpenCreate}>
              <PlusCircle className="w-4 h-4" />
              Tạo bài viết
            </Button>
          </div>
        </Card>

        {/* Feed Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'latest', label: 'Mới nhất' },
            { id: 'following', label: 'Đang theo dõi' },
            { id: 'featured', label: 'Bài viết nổi bật' },
            ...(isAuthenticated ? [{ id: 'saved', label: 'Đã lưu' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFeedType(tab.id as any)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors shrink-0',
                feedType === tab.id
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cursor-Paginated Post Feed */}
        <PostFeed
          queryParams={{ feedType, limit: 8 }}
          emptyTitle={
            feedType === 'following'
              ? 'Chưa có bài viết từ người bạn theo dõi'
              : feedType === 'saved'
                ? 'Chưa có bài viết đã lưu'
                : 'Chưa có bài viết nào'
          }
          emptyDescription={
            feedType === 'following'
              ? 'Hãy theo dõi các thành viên gợi ý ở cột bên phải để cập nhật hành trình mới nhất của họ.'
              : 'Nhấn "Tạo bài viết" để chia sẻ chuyến đi đầu tiên của bạn!'
          }
        />
      </section>

      {/* Right Sidebar (3 cols on Desktop): Suggested Users, AI Assistant CTA, System Health */}
      <aside className="lg:col-span-3 space-y-5 sticky top-20">
        {/* Suggested Users to Follow */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              Gợi ý theo dõi
            </h3>
            <Link
              to="/explore"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Khám phá
            </Link>
          </div>

          {loadingSuggested ? (
            <div className="space-y-2.5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : suggestedUsers.length === 0 ? (
            <p className="text-xs text-stone-400">
              Bạn đã theo dõi tất cả thành viên nổi bật.
            </p>
          ) : (
            <div className="space-y-3">
              {suggestedUsers.slice(0, 4).map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    to={`/users/${member.username}`}
                    className="flex items-center gap-2.5 min-w-0"
                  >
                    <img
                      src={
                        member.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(member.fullName)}&background=166534&color=fff`
                      }
                      alt={member.fullName}
                      className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate flex items-center gap-1">
                        {member.fullName}
                        <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
                      </p>
                      <p className="text-[11px] text-stone-500 truncate">
                        @{member.username} • {member.city}
                      </p>
                    </div>
                  </Link>
                  <FollowButton
                    targetUserId={member.userId}
                    initialFollowing={member.isFollowing}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* AI Travel Assistant Quick Card */}
        <Card className="p-4 bg-emerald-900 text-white border-emerald-800">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-emerald-300" />
            <h3 className="text-sm font-bold">AI Travel Assistant</h3>
          </div>
          <p className="text-xs text-emerald-100/90 leading-relaxed mb-3">
            Bạn sắp đi trekking Yên Tử hay cắm trại Sóc Sơn? Để AI phân tích
            chuyến đi, lập checklist và tìm thiết bị còn thiếu trong ngân sách.
          </p>
          <Link to="/ai-assistant">
            <Button
              variant="secondary"
              size="sm"
              className="w-full font-semibold"
            >
              <CheckSquare className="w-4 h-4" />
              Tạo Checklist Chuyến Đi
            </Button>
          </Link>
        </Card>

        {/* Live Backend Health Check Widget */}
        <SystemStatusWidget />
      </aside>

      <CreatePostModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  );
};
