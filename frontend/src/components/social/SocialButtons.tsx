import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Heart,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { socialService } from '../../services/social.service';
import { useAuthStore } from '../../store/auth.store';
import { Button, Skeleton } from '../ui/DesignSystem';
import { cn } from '../../utils/format';

export const LikeButton: React.FC<{
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  onChange?: (liked: boolean, count: number) => void;
}> = ({ postId, initialLiked, initialCount, onChange }) => {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  React.useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  const handleToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (pending) return;
    setPending(true);

    const prevLiked = liked;
    const prevCount = count;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    setLiked(nextLiked);
    setCount(nextCount);

    try {
      const res = nextLiked
        ? await socialService.likePost(postId)
        : await socialService.unlikePost(postId);
      setLiked(res.liked);
      setCount(res.likesCount);
      onChange?.(res.liked, res.likesCount);
      queryClient.invalidateQueries({ queryKey: ['post-detail', postId] });
    } catch {
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors',
        liked
          ? 'text-red-600 bg-red-50 hover:bg-red-100'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
      )}
    >
      <Heart className={cn('w-4 h-4', liked && 'fill-current')} />
      <span>{count} Thích</span>
    </button>
  );
};

export const SavePostButton: React.FC<{
  postId: string;
  initialSaved: boolean;
}> = ({ postId, initialSaved }) => {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  React.useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  const handleToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (pending) return;
    setPending(true);

    const prev = saved;
    setSaved(!prev);
    try {
      const res = !prev
        ? await socialService.savePost(postId)
        : await socialService.unsavePost(postId);
      setSaved(res.saved);
      queryClient.invalidateQueries({ queryKey: ['posts-feed', 'saved'] });
    } catch {
      setSaved(prev);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors',
        saved
          ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-semibold'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
      )}
    >
      <Bookmark className={cn('w-4 h-4', saved && 'fill-current')} />
      <span>{saved ? 'Đã lưu' : 'Lưu bài'}</span>
    </button>
  );
};

export const FollowButton: React.FC<{
  targetUserId: string;
  initialFollowing: boolean;
  size?: 'sm' | 'md';
  onFollowChange?: (isFollowing: boolean, followersCount: number) => void;
}> = ({ targetUserId, initialFollowing, size = 'sm', onFollowChange }) => {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    setIsFollowing(initialFollowing);
  }, [initialFollowing]);

  if (user && user.id === targetUserId) {
    return null;
  }

  const handleToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setLoading(true);
    try {
      const res = isFollowing
        ? await socialService.unfollowUser(targetUserId)
        : await socialService.followUser(targetUserId);
      setIsFollowing(res.isFollowing);
      onFollowChange?.(res.isFollowing, res.followersCount);
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed', 'following'] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? 'outline' : 'primary'}
      isLoading={loading}
      onClick={handleToggle}
    >
      {isFollowing ? (
        <>
          <UserCheck className="w-3.5 h-3.5" />
          Đang theo dõi
        </>
      ) : (
        <>
          <UserPlus className="w-3.5 h-3.5" />
          Theo dõi
        </>
      )}
    </Button>
  );
};

export const FollowListModal: React.FC<{
  targetUserId: string;
  mode: 'followers' | 'following' | null;
  onClose: () => void;
}> = ({ targetUserId, mode, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['user-connections', targetUserId, mode],
    queryFn: () =>
      mode === 'followers'
        ? socialService.getFollowers(targetUserId)
        : socialService.getFollowing(targetUserId),
    enabled: Boolean(mode && targetUserId),
  });

  if (!mode) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-stone-900">
            {mode === 'followers'
              ? 'Danh sách Người theo dõi (Followers)'
              : 'Danh sách Đang theo dõi (Following)'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : !data || data.length === 0 ? (
            <p className="text-xs text-stone-500 text-center py-8">
              Chưa có thành viên nào trong danh sách này.
            </p>
          ) : (
            data.map((item) => (
              <div
                key={item.userId}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-stone-50"
              >
                <Link
                  to={`/users/${item.username}`}
                  onClick={onClose}
                  className="flex items-center gap-3 min-w-0"
                >
                  <img
                    src={
                      item.avatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(item.fullName)}&background=166534&color=fff`
                    }
                    alt={item.fullName}
                    className="w-10 h-10 rounded-full object-cover border border-stone-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-stone-900 truncate flex items-center gap-1">
                      {item.fullName}
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    </p>
                    <p className="text-[11px] text-stone-500 truncate">
                      @{item.username} • {item.city}
                    </p>
                  </div>
                </Link>
                <FollowButton
                  targetUserId={item.userId}
                  initialFollowing={item.isFollowing}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
