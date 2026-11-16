import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  Flame,
  Hash,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import { ActivityType } from '../types';
import { socialService } from '../services/social.service';
import { Card } from '../components/ui/DesignSystem';
import { PostFeed } from '../components/social/PostFeed';
import { cn } from '../utils/format';

const TOPICS: { value: ActivityType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả chủ đề' },
  { value: 'TREKKING', label: 'Trekking / Leo núi' },
  { value: 'CAMPING', label: 'Camping / Cắm trại' },
  { value: 'MOTORBIKE_TOUR', label: 'Phượt xe máy' },
  { value: 'BACKPACKING', label: 'Backpacking' },
  { value: 'MOUNTAINEERING', label: 'Leo núi kỹ thuật' },
  { value: 'BEACH', label: 'Đi biển' },
  { value: 'SIGHTSEEING', label: 'Tham quan' },
  { value: 'OTHER', label: 'Hoạt động khác' },
];

export const ExplorePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialHashtag = searchParams.get('hashtag') || '';
  const initialQuery = searchParams.get('q') || '';

  const [keyword, setKeyword] = useState(initialQuery);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialQuery);
  const [selectedHashtag, setSelectedHashtag] = useState(initialHashtag);
  const [selectedActivity, setSelectedActivity] = useState<
    ActivityType | 'ALL'
  >('ALL');
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>('grid');

  const { data: trendingTags = [] } = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: () => socialService.getTrendingHashtags(),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedKeyword(keyword.trim());
  };

  const handleSelectTag = (tag: string) => {
    const clean = tag.replace(/^#/, '');
    if (selectedHashtag === clean) {
      setSelectedHashtag('');
      searchParams.delete('hashtag');
      setSearchParams(searchParams);
    } else {
      setSelectedHashtag(clean);
      setSearchParams({ hashtag: clean });
    }
  };

  return (
    <div className="space-y-6">
      {/* Explore Search & Controls Header */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-700" />
              <h1 className="text-xl font-bold text-stone-900">
                Khám phá Hành Trình & Kinh Nghiệm Du Lịch
              </h1>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Tìm kiếm bài viết theo từ khóa, hashtag xu hướng hoặc lọc theo
              loại hoạt động ngoài trời
            </p>
          </div>

          {/* Grid / List View Switcher */}
          <div className="inline-flex items-center rounded-xl border border-stone-200 p-1 bg-stone-50 self-start">
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                layoutMode === 'grid'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800',
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Dạng Lưới (Grid)
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('list')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                layoutMode === 'list'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800',
              )}
            >
              <List className="w-3.5 h-3.5" />
              Dạng Danh sách (List)
            </button>
          </div>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm bài viết theo địa điểm (Lảo Thẩn, Yên Tử, Đồng Đò), nội dung, kinh nghiệm..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-900 transition-colors"
          >
            Tìm kiếm
          </button>
        </form>

        {/* Trending Hashtag Pills */}
        {trendingTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-semibold text-stone-500 flex items-center gap-1 mr-1">
              <Hash className="w-3.5 h-3.5 text-emerald-700" />
              Hashtag nổi bật:
            </span>
            {trendingTags.map((t) => {
              const clean = t.tag.replace(/^#/, '');
              const active = selectedHashtag.toLowerCase() === clean.toLowerCase();
              return (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => handleSelectTag(clean)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    active
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-emerald-50 hover:text-emerald-800',
                  )}
                >
                  <span>{t.tag}</span>
                  <span className="text-[10px] opacity-75">
                    ({t.postsCount})
                  </span>
                  {active && <X className="w-3 h-3 ml-0.5" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Activity Filter Bar + Featured Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {TOPICS.map((topic) => (
              <button
                key={topic.value}
                type="button"
                onClick={() => setSelectedActivity(topic.value)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                  selectedActivity === topic.value
                    ? 'bg-emerald-100 text-emerald-900 font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70',
                )}
              >
                {topic.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOnlyFeatured((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors',
              onlyFeatured
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50',
            )}
          >
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            Chỉ bài viết nổi bật
          </button>
        </div>
      </Card>

      {/* Explore Results Feed */}
      <PostFeed
        layoutMode={layoutMode}
        queryParams={{
          feedType: onlyFeatured ? 'featured' : 'latest',
          hashtag: selectedHashtag || undefined,
          activityType:
            selectedActivity === 'ALL' ? undefined : selectedActivity,
          q: submittedKeyword || undefined,
          limit: 8,
        }}
        emptyTitle="Không tìm thấy bài viết phù hợp"
        emptyDescription="Hãy thử đổi từ khóa tìm kiếm, bỏ chọn hashtag hoặc chọn chủ đề hoạt động khác."
      />
    </div>
  );
};
