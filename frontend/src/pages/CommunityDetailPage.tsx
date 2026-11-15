import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  EyeOff,
  FileText,
  Plus,
  RotateCcw,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  communityService,
  CommunityMemberItem,
} from '../services/community.service';
import {
  moderationService,
  ModerationReportItem,
} from '../services/moderation.service';
import { useAuthStore } from '../store/auth.store';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';
import { PostCard } from '../components/social/PostCard';
import { CreatePostModal } from '../components/social/PostModals';
import { formatVietnamDateTime } from '../utils/format';

export const CommunityDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'posts' | 'members' | 'moderation'>(
    'posts',
  );
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const [rulesDraft, setRulesDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [savingRules, setSavingRules] = useState(false);

  const {
    data: community,
    isLoading,
    isError,
    refetch: refetchCommunity,
  } = useQuery({
    queryKey: ['community-detail', slug],
    queryFn: () => communityService.getCommunityDetail(slug!),
    enabled: Boolean(slug),
  });

  const {
    data: postsData,
    isLoading: loadingPosts,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ['community-posts', slug],
    queryFn: () => communityService.getCommunityPosts(slug!, { limit: 20 }),
    enabled: Boolean(slug),
  });

  const { data: membersData, refetch: refetchMembers } = useQuery({
    queryKey: ['community-members', slug],
    queryFn: () =>
      communityService.getCommunityMembers(slug!, { page: 1, limit: 50 }),
    enabled: Boolean(slug) && activeTab === 'members',
  });

  const canModerate = Boolean(
    community &&
      (community.myRole === 'OWNER' ||
        community.myRole === 'MODERATOR' ||
        user?.role === 'ADMIN'),
  );
  const isOwner = Boolean(community && community.myRole === 'OWNER');

  const { data: modQueueData, refetch: refetchQueue } = useQuery({
    queryKey: ['community-mod-reports', community?.id],
    queryFn: () =>
      moderationService.getModerationQueue({
        communityId: community!.id,
        page: 1,
        limit: 30,
      }),
    enabled: Boolean(community?.id) && canModerate && activeTab === 'moderation',
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !community) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-stone-900">
            Không tìm thấy cộng đồng
          </h2>
          <Link to="/communities">
            <Button variant="primary" size="sm">
              Quay lại danh sách cộng đồng
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleJoinOrLeave = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setJoining(true);
    try {
      if (community.isJoined) {
        await communityService.leaveCommunity(community.slug);
      } else {
        await communityService.joinCommunity(community.slug);
      }
      await refetchCommunity();
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    } catch (err: any) {
      window.alert(
        err.response?.data?.message ||
          'Không thể thực hiện thao tác với cộng đồng.',
      );
    } finally {
      setJoining(false);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRules(true);
    try {
      const rules = rulesDraft
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      await communityService.updateRules(community.slug, {
        rules,
        description: descDraft.trim(),
      });
      setEditingRules(false);
      await refetchCommunity();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Cập nhật nội quy thất bại.');
    } finally {
      setSavingRules(false);
    }
  };

  const handleToggleModerator = async (member: CommunityMemberItem) => {
    const nextRole = member.role === 'MODERATOR' ? 'MEMBER' : 'MODERATOR';
    try {
      await communityService.assignMemberRole(
        community.slug,
        member.userId,
        nextRole,
      );
      refetchMembers();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Không thể cập nhật vai trò.');
    }
  };

  const handleTransferOwnership = async (member: CommunityMemberItem) => {
    if (
      !window.confirm(
        `Chuyển quyền Chủ cộng đồng cho ${member.user?.fullName || member.userId}?`,
      )
    ) {
      return;
    }
    try {
      await communityService.transferOwnership(community.slug, member.userId);
      await refetchCommunity();
      refetchMembers();
    } catch (err: any) {
      window.alert(
        err.response?.data?.message || 'Không thể chuyển quyền sở hữu.',
      );
    }
  };

  const handleReportDecision = async (
    report: ModerationReportItem,
    action: 'HIDE_CONTENT' | 'RESTORE_CONTENT' | 'NONE',
    status: 'RESOLVED' | 'DISMISSED',
  ) => {
    const publicOutcome =
      status === 'RESOLVED'
        ? 'Quản trị viên cộng đồng đã xem xét và ẩn nội dung vi phạm.'
        : 'Quản trị viên cộng đồng đã xem xét nhưng chưa phát hiện vi phạm.';
    try {
      await moderationService.handleReport(report.id, {
        status,
        action,
        publicOutcome,
      });
      refetchQueue();
      refetchPosts();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Không thể xử lý báo cáo.');
    }
  };

  const handleModeratePost = async (
    postId: string,
    action: 'HIDE' | 'RESTORE',
  ) => {
    const reason = window.prompt(
      action === 'HIDE' ? 'Nhập lý do ẩn bài viết:' : 'Nhập lý do khôi phục:',
      action === 'HIDE' ? 'Vi phạm nội quy cộng đồng' : 'Đã xem xét lại',
    );
    if (!reason?.trim()) return;
    try {
      await communityService.moderatePost(community.slug, postId, {
        action,
        reason: reason.trim(),
      });
      refetchPosts();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Thao tác thất bại.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          to="/communities"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Tất cả cộng đồng
        </Link>
      </div>

      {/* Header Banner */}
      <Card className="overflow-hidden">
        <div className="h-44 sm:h-52 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 relative">
          {community.coverUrl && (
            <img
              src={community.coverUrl}
              alt={community.name}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-stone-900">
                {community.name}
              </h1>
              <Badge variant="emerald">{community.activityType}</Badge>
              {community.myRole && (
                <Badge variant="stone">
                  <Shield className="w-3 h-3" />
                  {community.myRole}
                </Badge>
              )}
            </div>
            <p className="text-xs text-stone-600 max-w-2xl">
              {community.description}
            </p>
            <p className="text-xs text-stone-500 font-medium inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-700" />
              {community.membersCount} thành viên
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {community.isJoined && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreatePostOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Đăng bài trong nhóm
              </Button>
            )}
            <Button
              variant={community.isJoined ? 'outline' : 'primary'}
              size="sm"
              isLoading={joining}
              onClick={handleJoinOrLeave}
            >
              {community.isJoined ? 'Rời nhóm' : 'Tham gia cộng đồng'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'posts'
              ? 'bg-emerald-700 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Bài viết
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'members'
              ? 'bg-emerald-700 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Thành viên ({community.membersCount})
        </button>
        {canModerate && (
          <button
            type="button"
            onClick={() => setActiveTab('moderation')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'moderation'
                ? 'bg-amber-600 text-white'
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Kiểm duyệt cộng đồng
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          {activeTab === 'posts' && (
            <>
              {!community.isJoined && (
                <Card className="p-4 bg-emerald-50/70 border-emerald-200 flex items-center justify-between gap-3">
                  <p className="text-xs text-emerald-900">
                    Bạn đang xem chế độ công khai. Hãy tham gia cộng đồng để
                    đăng bài viết mới.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleJoinOrLeave}
                  >
                    Tham gia ngay
                  </Button>
                </Card>
              )}

              {loadingPosts ? (
                <Card className="p-5 space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-24 w-full" />
                </Card>
              ) : !postsData || postsData.items.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-6 h-6" />}
                  title="Chưa có bài viết nào trong cộng đồng"
                  description="Hãy là người đầu tiên chia sẻ kinh nghiệm hoặc lịch trình tại đây."
                />
              ) : (
                postsData.items.map((post) => (
                  <div key={post.id} className="space-y-1.5">
                    <PostCard post={post} onDeleted={() => refetchPosts()} />
                    {canModerate && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleModeratePost(post.id, 'HIDE')}
                          className="text-[11px] font-medium text-amber-700 hover:underline inline-flex items-center gap-1"
                        >
                          <EyeOff className="w-3 h-3" />
                          Ẩn bài viết khỏi cộng đồng
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'members' && (
            <Card className="divide-y divide-stone-100">
              {!membersData || membersData.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  Chưa có dữ liệu thành viên.
                </div>
              ) : (
                membersData.items.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={
                          m.user?.avatarUrl ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.fullName || 'U')}&background=166534&color=fff`
                        }
                        alt={m.user?.fullName || 'Member'}
                        className="w-10 h-10 rounded-full object-cover border border-stone-200"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/users/${m.user?.username || m.userId}`}
                            className="text-sm font-bold text-stone-900 hover:text-emerald-700 truncate"
                          >
                            {m.user?.fullName || 'Thành viên'}
                          </Link>
                          <Badge
                            variant={m.role === 'OWNER' ? 'emerald' : 'stone'}
                          >
                            {m.role}
                          </Badge>
                        </div>
                        <p className="text-xs text-stone-500">
                          @{m.user?.username} • Tham gia{' '}
                          {formatVietnamDateTime(m.joinedAt)}
                        </p>
                      </div>
                    </div>

                    {isOwner && m.role !== 'OWNER' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleModerator(m)}
                        >
                          {m.role === 'MODERATOR'
                            ? 'Gỡ Moderator'
                            : 'Gán Moderator'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTransferOwnership(m)}
                          title="Chuyển quyền Chủ cộng đồng"
                        >
                          <Crown className="w-3.5 h-3.5 text-amber-600" />
                          Chuyển Owner
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </Card>
          )}

          {activeTab === 'moderation' && canModerate && (
            <Card className="divide-y divide-stone-100">
              <div className="p-4 bg-stone-50 border-b border-stone-100">
                <h3 className="text-sm font-bold text-stone-900">
                  Báo cáo vi phạm trong cộng đồng
                </h3>
                <p className="text-xs text-stone-500">
                  Quản trị viên cộng đồng chỉ xử lý báo cáo thuộc phạm vi cộng
                  đồng này.
                </p>
              </div>
              {!modQueueData || modQueueData.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  Hiện chưa có báo cáo nào trong cộng đồng.
                </div>
              ) : (
                modQueueData.items.map((rep) => (
                  <div key={rep.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="stone">{rep.targetType}</Badge>
                        <Badge
                          variant={
                            rep.status === 'RESOLVED' ? 'emerald' : 'demo'
                          }
                        >
                          {rep.status}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-stone-400">
                        {formatVietnamDateTime(rep.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-stone-800">
                      Lý do: {rep.reason}
                    </p>
                    {rep.targetPreview && (
                      <p className="text-xs text-stone-600 bg-stone-50 p-2 rounded-lg">
                        Nội dung: {rep.targetPreview.label}
                      </p>
                    )}
                    {rep.status !== 'RESOLVED' && rep.status !== 'DISMISSED' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            handleReportDecision(rep, 'HIDE_CONTENT', 'RESOLVED')
                          }
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          Ẩn nội dung & Đóng báo cáo
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleReportDecision(rep, 'NONE', 'DISMISSED')
                          }
                        >
                          Bác bỏ
                        </Button>
                      </div>
                    )}
                    {rep.targetPreview?.isHidden && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleModeratePost(rep.targetId, 'RESTORE')
                        }
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Khôi phục bài viết
                      </Button>
                    )}
                  </div>
                ))
              )}
            </Card>
          )}
        </div>

        {/* Right Sidebar: Rules */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">
                Nội quy cộng đồng
              </h3>
              {isOwner && !editingRules && (
                <button
                  type="button"
                  onClick={() => {
                    setRulesDraft((community.rules || []).join('\n'));
                    setDescDraft(community.description || '');
                    setEditingRules(true);
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Chỉnh sửa
                </button>
              )}
            </div>

            {editingRules ? (
              <form onSubmit={handleSaveRules} className="space-y-3">
                <textarea
                  rows={2}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Mô tả cộng đồng"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600"
                />
                <textarea
                  rows={4}
                  value={rulesDraft}
                  onChange={(e) => setRulesDraft(e.target.value)}
                  placeholder="Mỗi dòng 1 nội quy"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:border-emerald-600"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingRules(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={savingRules}
                  >
                    Lưu
                  </Button>
                </div>
              </form>
            ) : community.rules && community.rules.length > 0 ? (
              <ul className="space-y-2 text-xs text-stone-700">
                {community.rules.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-500">
                Chưa có nội quy riêng. Thành viên vui lòng tuân thủ quy tắc chung
                của TravelShare.
              </p>
            )}
          </Card>
        </div>
      </div>

      <CreatePostModal
        isOpen={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        communityId={community.id}
        communityName={community.name}
        onCreated={() => refetchPosts()}
      />
    </div>
  );
};
