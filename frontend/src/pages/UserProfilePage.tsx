import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  Edit3,
  Flag,
  MapPin,
  ShieldCheck,
  Star,
  Tent,
  Users,
} from 'lucide-react';
import { socialService } from '../services/social.service';
import { gearService } from '../services/gear.service';
import { bookingService } from '../services/booking.service';
import { useAuthStore } from '../store/auth.store';
import { Badge, Button, Card, Skeleton } from '../components/ui/DesignSystem';
import {
  FollowButton,
  FollowListModal,
} from '../components/social/SocialButtons';
import { PostFeed } from '../components/social/PostFeed';
import { GearCard } from '../components/gear/GearCard';
import { ReportModal } from '../components/moderation/ReportModal';
import { formatVietnamDateTime } from '../utils/format';

export const UserProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const [followModalMode, setFollowModalMode] = useState<
    'followers' | 'following' | null
  >(null);
  const [reportOpen, setReportOpen] = useState(false);

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => socialService.getPublicProfile(id!),
    enabled: Boolean(id),
  });

  const { data: ownerGear = [] } = useQuery({
    queryKey: ['user-public-gear', profile?.userId],
    queryFn: () => gearService.getPublicGearByOwner(profile!.userId),
    enabled: Boolean(profile?.userId),
  });

  const { data: userReviewsData } = useQuery({
    queryKey: ['user-reviews', profile?.userId],
    queryFn: () => bookingService.getUserReviews(profile!.userId),
    enabled: Boolean(profile?.userId),
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <Card className="p-6 space-y-4">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-stone-900">
            Không tìm thấy hồ sơ thành viên
          </h2>
          <p className="text-xs text-stone-500">
            Người dùng @{id} không tồn tại hoặc đã ngừng hoạt động.
          </p>
          <Link to="/feed">
            <Button variant="primary" size="sm">
              Quay lại Bảng tin
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isOwner = Boolean(
    user &&
      (user.id === profile.userId ||
        user.profile?.username === profile.username),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile Header Card */}
      <Card className="overflow-hidden">
        {/* Cover Image */}
        <div className="h-44 sm:h-56 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 relative">
          {profile.coverUrl && (
            <img
              src={profile.coverUrl}
              alt={profile.fullName}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-14 mb-4 relative z-10">
            <div className="flex items-end gap-4">
              <img
                src={
                  profile.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.fullName)}&background=166534&color=fff`
                }
                alt={profile.fullName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white shadow-md bg-white"
              />
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold text-stone-900">
                    {profile.fullName}
                  </h1>
                  <Badge variant="emerald">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Uy tín {profile.trustScore}★
                  </Badge>
                </div>
                <p className="text-xs text-stone-500 font-medium">
                  @{profile.username} • Kinh nghiệm: {profile.experienceLevel}
                </p>
              </div>
            </div>

            {/* Action Buttons: Edit Profile (if Owner) or Follow/Unfollow */}
            <div className="flex items-center gap-2">
              {isOwner ? (
                <>
                  <Link to="/my-gear">
                    <Button variant="secondary" size="sm">
                      <Tent className="w-4 h-4" />
                      Kho đồ của tôi
                    </Button>
                  </Link>
                  <Link to="/settings/profile">
                    <Button variant="outline" size="sm">
                      <Edit3 className="w-4 h-4" />
                      Chỉnh sửa hồ sơ
                    </Button>
                  </Link>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <FollowButton
                    targetUserId={profile.userId}
                    initialFollowing={profile.isFollowing}
                    size="md"
                    onFollowChange={() => refetch()}
                  />
                  {user && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportOpen(true)}
                      title="Báo cáo người dùng"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Báo cáo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bio & Location */}
          <p className="text-sm text-stone-800 leading-relaxed max-w-2xl mb-4">
            {profile.bio ||
              'Thành viên cộng đồng chia sẻ kinh nghiệm & đồ dùng du lịch TravelShare.'}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 mb-5">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-700" />
              {profile.city}
            </span>
            {profile.favoriteActivities?.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-700" />
                Yêu thích: {profile.favoriteActivities.join(', ')}
              </span>
            )}
          </div>

          {/* Profile Statistics Bar */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-stone-100 max-w-md">
            <div className="p-2.5 rounded-xl bg-stone-50 text-center">
              <p className="text-base font-bold text-stone-900">
                {profile.postsCount}
              </p>
              <p className="text-[11px] text-stone-500">Bài đăng</p>
            </div>

            <button
              type="button"
              onClick={() => setFollowModalMode('followers')}
              className="p-2.5 rounded-xl bg-stone-50 hover:bg-emerald-50 text-center transition-colors"
            >
              <p className="text-base font-bold text-stone-900">
                {profile.followersCount}
              </p>
              <p className="text-[11px] text-stone-500 flex items-center justify-center gap-1">
                <Users className="w-3 h-3 text-emerald-700" />
                Người theo dõi
              </p>
            </button>

            <button
              type="button"
              onClick={() => setFollowModalMode('following')}
              className="p-2.5 rounded-xl bg-stone-50 hover:bg-emerald-50 text-center transition-colors"
            >
              <p className="text-base font-bold text-stone-900">
                {profile.followingCount}
              </p>
              <p className="text-[11px] text-stone-500">Đang theo dõi</p>
            </button>
          </div>
        </div>
      </Card>

      {/* Member's Shared Gear Items (Phase 3 Social <-> Gear Integration) */}
      {ownerGear.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Tent className="w-4 h-4 text-emerald-700" />
              Thiết bị đang chia sẻ của {profile.fullName} ({ownerGear.length})
            </h2>
            <Link
              to="/gear"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Xem trên Marketplace →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ownerGear.map((item) => (
              <GearCard key={item.id} gear={item} />
            ))}
          </div>
        </div>
      )}

      {/* Member's Trust Reviews from Completed Bookings (Phase 4) */}
      {userReviewsData && userReviewsData.items.length > 0 && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              Đánh giá uy tín từ giao dịch thuê/mượn ({userReviewsData.ratingCount})
            </h2>
            <span className="text-xs font-bold text-emerald-800">
              Điểm trung bình: {userReviewsData.ratingAvg}★
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {userReviewsData.items.map((rev) => (
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
        </Card>
      )}

      {/* Author's Posts Section */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-stone-900">
          Bài viết đã đăng của {profile.fullName} ({profile.postsCount})
        </h2>
        <PostFeed
          queryParams={{ authorId: profile.userId, limit: 8 }}
          emptyTitle="Chưa có bài viết nào"
          emptyDescription={`${profile.fullName} chưa đăng bài viết nào trên TravelShare.`}
        />
      </div>

      <FollowListModal
        targetUserId={profile.userId}
        mode={followModalMode}
        onClose={() => setFollowModalMode(null)}
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="USER"
        targetId={profile.userId}
        targetLabel={`${profile.fullName} (@${profile.username})`}
      />
    </div>
  );
};
