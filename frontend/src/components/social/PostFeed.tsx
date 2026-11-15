import React, { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Compass, RefreshCw } from 'lucide-react';
import {
  FeedQueryParams,
  socialService,
} from '../../services/social.service';
import { PostItem } from '../../types';
import { Button, Card, EmptyState, Skeleton } from '../ui/DesignSystem';
import { PostCard } from './PostCard';

export const PostFeed: React.FC<{
  queryParams: Omit<FeedQueryParams, 'cursor'>;
  layoutMode?: 'list' | 'grid';
  emptyTitle?: string;
  emptyDescription?: string;
}> = ({
  queryParams,
  layoutMode = 'list',
  emptyTitle = 'Chưa có bài viết nào',
  emptyDescription = 'Hãy là người đầu tiên đăng bài chia sẻ hành trình du lịch hoặc kinh nghiệm chuẩn bị đồ phượt!',
}) => {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['posts-feed', queryParams],
    queryFn: ({ pageParam }) =>
      socialService.getPostsFeed({
        ...queryParams,
        cursor: pageParam as string | undefined,
        limit: queryParams.limit || 8,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
  });

  // Deduplicate posts across pages by id so infinite scrolling never shows duplicates
  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    const list: PostItem[] = [];
    for (const page of data.pages) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          list.push(item);
        }
      }
    }
    return list;
  }, [data]);

  // Automatic Infinite Scroll with IntersectionObserver
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '240px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((idx) => (
          <Card key={idx} className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-stone-800">
          Không thể tải danh sách bài viết từ máy chủ
        </p>
        <p className="text-xs text-stone-500">
          Hãy đảm bảo Backend API (`http://localhost:4000`) và MongoDB đang hoạt
          động.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Thử tải lại
        </Button>
      </Card>
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="w-6 h-6" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div
        className={
          layoutMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 gap-5 items-start'
            : 'space-y-5'
        }
      >
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Sentinel for IntersectionObserver Infinite Scroll */}
      <div ref={loadMoreRef} className="py-2 text-center">
        {isFetchingNextPage ? (
          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Đang tải thêm bài viết...
          </div>
        ) : hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
          >
            Tải thêm bài viết
          </Button>
        ) : (
          <p className="text-xs text-stone-400">
            Bạn đã xem hết bài viết trong danh sách này.
          </p>
        )}
      </div>
    </div>
  );
};
