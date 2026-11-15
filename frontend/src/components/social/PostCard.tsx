import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Edit3,
  ExternalLink,
  Flag,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Tent,
  Trash2,
  Users,
} from 'lucide-react';
import { PostItem } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import { socialService } from '../../services/social.service';
import { Badge, Card } from '../ui/DesignSystem';
import { formatVietnamDateTime, formatVnd } from '../../utils/format';
import { MediaGallery } from './MediaGallery';
import { LikeButton, SavePostButton } from './SocialButtons';
import { CommentSection } from './CommentSection';
import { EditPostModal } from './PostModals';
import { ReportModal } from '../moderation/ReportModal';

export const PostCard: React.FC<{
  post: PostItem;
  defaultOpenComments?: boolean;
  onDeleted?: (postId: string) => void;
}> = ({ post, defaultOpenComments = false, onDeleted }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  React.useEffect(() => {
    setCommentsCount(post.commentsCount);
  }, [post.commentsCount]);

  const canModify = Boolean(
    user && (user.id === post.authorId || user.role === 'ADMIN'),
  );

  const handleDelete = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) {
      return;
    }
    setDeleting(true);
    try {
      await socialService.deletePost(post.id);
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
      onDeleted?.(post.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/posts/${post.id}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => { });
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <>
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <div className="p-4">
          {/* Post Author Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link to={`/users/${post.author.username}`} className="shrink-0">
                <img
                  src={
                    post.author.avatarUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.fullName)}&background=166534&color=fff`
                  }
                  alt={post.author.fullName}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-200"
                />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    to={`/users/${post.author.username}`}
                    className="text-sm font-bold text-stone-900 hover:text-emerald-700 truncate"
                  >
                    {post.author.fullName}
                  </Link>
                  <span className="inline-flex items-center gap-0.5 text-xs text-emerald-700 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {post.author.trustScore}
                  </span>
                  {post.activityType && (
                    <Badge variant="emerald">{post.activityType}</Badge>
                  )}
                  {post.community && (
                    <Link
                      to={`/communities/${post.community.slug}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      <Users className="w-3 h-3" />
                      {post.community.name}
                    </Link>
                  )}
                  {post.isDemo && <Badge variant="demo">DỮ LIỆU DEMO</Badge>}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                  <Link
                    to={`/posts/${post.id}`}
                    className="hover:underline"
                    title="Xem chi tiết bài viết"
                  >
                    {formatVietnamDateTime(post.createdAt)}
                  </Link>
                  {post.locationName && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                        <MapPin className="w-3 h-3" />
                        {post.locationName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Owner / Admin Edit & Delete Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <Link
                to={`/posts/${post.id}`}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                title="Mở trang chi tiết bài viết"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              {user && user.id !== post.authorId && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50"
                  title="Báo cáo bài viết"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )}
              {canModify && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingPost(post)}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-700 hover:bg-emerald-50"
                    title="Chỉnh sửa bài viết"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50"
                    title="Xóa bài viết"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Post Content */}
          <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-line break-words mb-3">
            {post.content}
          </p>

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {post.hashtags.map((tag) => (
                <Link
                  key={tag}
                  to={`/explore?hashtag=${encodeURIComponent(tag.replace(/^#/, ''))}`}
                  className="text-xs font-medium text-emerald-700 hover:underline bg-emerald-50/70 px-2 py-0.5 rounded-md"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Media Gallery (Multi-image / Video) */}
        <MediaGallery
          mediaUrls={post.mediaUrls}
          altPrefix={post.locationName || post.author.fullName}
        />

        {/* Attached Gear Tags */}
        {post.gearTags && post.gearTags.length > 0 && (
          <div className="p-3.5 bg-emerald-50/50 border-t border-stone-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 mb-2 flex items-center gap-1.5">
              <Tent className="w-3.5 h-3.5" />
              Thiết bị du lịch gắn trong bài
            </p>
            <div className="flex flex-wrap gap-2">
              {post.gearTags.map((g) => (
                <Link
                  key={g.id}
                  to={`/gear/${g.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-medium text-stone-800 hover:border-emerald-500 transition-colors"
                >
                  <span>{g.title}</span>
                  <span className="text-emerald-700 font-bold">
                    {g.dailyPriceVnd === 0
                      ? 'Miễn phí'
                      : `${formatVnd(g.dailyPriceVnd)}/ngày`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="px-4 py-2.5 border-t border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            <LikeButton
              postId={post.id}
              initialLiked={post.isLiked}
              initialCount={post.likesCount}
            />

            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{commentsCount} Bình luận</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>{copiedShare ? 'Đã sao chép link!' : 'Chia sẻ'}</span>
            </button>
          </div>

          <SavePostButton postId={post.id} initialSaved={post.isSaved} />
        </div>

        {/* Expandable Comment Section */}
        {showComments && (
          <div className="px-4 pb-4">
            <CommentSection
              postId={post.id}
              postAuthorId={post.authorId}
              onCommentsCountChange={(delta) =>
                setCommentsCount((prev) => Math.max(0, prev + delta))
              }
            />
          </div>
        )}
      </Card>

      <EditPostModal
        post={editingPost}
        onClose={() => setEditingPost(null)}
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="POST"
        targetId={post.id}
        targetLabel={`Bài viết của ${post.author.fullName}`}
      />
    </>
  );
};
