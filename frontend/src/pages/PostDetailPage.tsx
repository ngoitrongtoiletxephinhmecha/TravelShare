import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { socialService } from '../services/social.service';
import { Button, Card, Skeleton } from '../components/ui/DesignSystem';
import { PostCard } from '../components/social/PostCard';

export const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: post,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['post-detail', id],
    queryFn: () => socialService.getPostById(id!),
    enabled: Boolean(id),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Bảng tin
        </Link>
      </div>

      {isLoading ? (
        <Card className="p-6 space-y-4">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </Card>
      ) : isError || !post ? (
        <Card className="p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-stone-900">
            Không tìm thấy bài viết
          </h2>
          <p className="text-xs text-stone-500">
            Bài viết này có thể đã bị xóa hoặc đường dẫn không tồn tại.
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate('/feed')}>
            Về trang Bảng tin
          </Button>
        </Card>
      ) : (
        <PostCard
          post={post}
          defaultOpenComments={true}
          onDeleted={() => navigate('/feed')}
        />
      )}
    </div>
  );
};
