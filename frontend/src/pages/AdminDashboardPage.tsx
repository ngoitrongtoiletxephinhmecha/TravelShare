import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Flag,
  Lock,
  RotateCcw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Users,
} from 'lucide-react';
import {
  AccountStatus,
  AdminContentItem,
  AdminDisputeItem,
  AdminUserItem,
  DisputeStatus,
  ModerationReportItem,
  moderationService,
  ReportStatus,
  ReportTargetType,
} from '../services/moderation.service';
import { useAuthStore } from '../store/auth.store';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui/DesignSystem';
import { formatVietnamDateTime } from '../utils/format';

type AdminTab = 'overview' | 'reports' | 'users' | 'content' | 'disputes';

export const AdminDashboardPage: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const [tab, setTab] = useState<AdminTab>('overview');

  // Reports filters
  const [reportStatus, setReportStatus] = useState<ReportStatus | ''>('');
  const [reportType, setReportType] = useState<ReportTargetType | ''>('');
  const [reportPage, setReportPage] = useState(1);

  // Users filters
  const [userSearch, setUserSearch] = useState('');
  const [userStatus, setUserStatus] = useState<AccountStatus | ''>('');
  const [userPage, setUserPage] = useState(1);

  // Content filters
  const [contentType, setContentType] = useState<'POST' | 'COMMENT' | 'GEAR'>(
    'POST',
  );
  const [contentSearch, setContentSearch] = useState('');
  const [contentVis, setContentVis] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>(
    'ALL',
  );

  // Report handling modal state
  const [selectedReport, setSelectedReport] =
    useState<ModerationReportItem | null>(null);
  const [decisionStatus, setDecisionStatus] =
    useState<ReportStatus>('RESOLVED');
  const [decisionAction, setDecisionAction] = useState<
    'NONE' | 'HIDE_CONTENT' | 'RESTORE_CONTENT' | 'SUSPEND_USER'
  >('HIDE_CONTENT');
  const [publicOutcome, setPublicOutcome] = useState(
    'Báo cáo đã được xem xét và xử lý theo quy định cộng đồng.',
  );
  const [internalNote, setInternalNote] = useState('');
  const [handlingReport, setHandlingReport] = useState(false);

  const isAdmin = isAuthenticated && user?.role === 'ADMIN';

  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => moderationService.getAdminOverview(),
    enabled: isAdmin,
  });

  const {
    data: reportsData,
    isLoading: loadingReports,
    refetch: refetchReports,
  } = useQuery({
    queryKey: ['admin-reports', { reportStatus, reportType, reportPage }],
    queryFn: () =>
      moderationService.getModerationQueue({
        status: reportStatus || undefined,
        targetType: reportType || undefined,
        page: reportPage,
        limit: 15,
      }),
    enabled: isAdmin && tab === 'reports',
  });

  const {
    data: usersData,
    isLoading: loadingUsers,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['admin-users', { userSearch, userStatus, userPage }],
    queryFn: () =>
      moderationService.getAdminUsers({
        q: userSearch.trim() || undefined,
        status: userStatus || undefined,
        page: userPage,
        limit: 15,
      }),
    enabled: isAdmin && tab === 'users',
  });

  const {
    data: contentData,
    isLoading: loadingContent,
    refetch: refetchContent,
  } = useQuery({
    queryKey: ['admin-content', { contentType, contentSearch, contentVis }],
    queryFn: () =>
      moderationService.getAdminContent({
        type: contentType,
        q: contentSearch.trim() || undefined,
        visibility: contentVis,
        page: 1,
        limit: 20,
      }),
    enabled: isAdmin && tab === 'content',
  });

  const {
    data: disputes = [],
    isLoading: loadingDisputes,
    refetch: refetchDisputes,
  } = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () => moderationService.getAdminDisputes(),
    enabled: isAdmin && tab === 'disputes',
  });

  const { data: auditLogsData } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => moderationService.getAuditLogs({ page: 1, limit: 10 }),
    enabled: isAdmin && tab === 'overview',
  });

  if (!isAuthenticated || user?.role !== 'ADMIN') {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-8 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
          <h2 className="text-base font-bold text-stone-900">
            Khu vực dành riêng cho Quản trị viên hệ thống
          </h2>
          <p className="text-xs text-stone-500">
            Tài khoản hiện tại không có quyền truy cập trang quản trị.
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

  const handleSubmitReportDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;
    setHandlingReport(true);
    try {
      await moderationService.handleReport(selectedReport.id, {
        status: decisionStatus,
        action: decisionAction,
        publicOutcome: publicOutcome.trim() || undefined,
        internalNote: internalNote.trim() || undefined,
      });
      setSelectedReport(null);
      setInternalNote('');
      refetchReports();
      refetchOverview();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Xử lý báo cáo thất bại.');
    } finally {
      setHandlingReport(false);
    }
  };

  const handleToggleUserStatus = async (u: AdminUserItem) => {
    const nextStatus: AccountStatus =
      u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Tạm khóa tài khoản @${u.username}?`
        : `Mở khóa tài khoản @${u.username}?`;
    if (!window.confirm(confirmMsg)) return;
    const reason = window.prompt(
      'Nhập lý do thay đổi trạng thái:',
      nextStatus === 'SUSPENDED'
        ? 'Vi phạm quy tắc cộng đồng'
        : 'Đã xác minh và mở khóa',
    );
    if (!reason?.trim()) return;
    try {
      await moderationService.updateUserStatus(u.id, {
        status: nextStatus,
        reason: reason.trim(),
      });
      refetchUsers();
      refetchOverview();
    } catch (err: any) {
      window.alert(
        err.response?.data?.message || 'Cập nhật trạng thái thất bại.',
      );
    }
  };

  const handleModerateContentItem = async (
    item: AdminContentItem,
    action: 'HIDE' | 'RESTORE',
  ) => {
    const reason = window.prompt(
      action === 'HIDE' ? 'Nhập lý do ẩn nội dung:' : 'Nhập lý do khôi phục:',
      action === 'HIDE' ? 'Nội dung không phù hợp' : 'Đã kiểm tra lại',
    );
    if (!reason?.trim()) return;
    try {
      await moderationService.moderateContent(item.type, item.id, {
        action,
        reason: reason.trim(),
      });
      refetchContent();
      refetchOverview();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Thao tác thất bại.');
    }
  };

  const handleResolveDispute = async (
    d: AdminDisputeItem,
    status: DisputeStatus,
  ) => {
    const adminNotes = window.prompt(
      'Nhập ghi chú kết luận khiếu nại:',
      status === 'RESOLVED_RENTER'
        ? 'Xử lý hoàn cọc cho người thuê theo bằng chứng.'
        : 'Xác nhận bàn giao hợp lệ cho chủ thiết bị.',
    );
    if (!adminNotes?.trim()) return;
    try {
      await moderationService.resolveDispute(d.id, {
        status,
        adminNotes: adminNotes.trim(),
      });
      refetchDisputes();
      refetchOverview();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Xử lý khiếu nại thất bại.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            Trung tâm Quản trị & Kiểm duyệt
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Quản lý báo cáo vi phạm, người dùng, nội dung, thiết bị và khiếu nại
            booking.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
        {(
          [
            { id: 'overview', label: 'Tổng quan' },
            { id: 'reports', label: 'Báo cáo vi phạm' },
            { id: 'users', label: 'Người dùng' },
            { id: 'content', label: 'Nội dung & Thiết bị' },
            { id: 'disputes', label: 'Khiếu nại Booking' },
          ] as { id: AdminTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-emerald-700 text-white'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {!overview ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs text-stone-500">Báo cáo chờ xử lý</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {overview.reportsPending}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-stone-500">Khiếu nại đang mở</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {overview.disputesOpen}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-stone-500">Thành viên / Bị khóa</p>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {overview.usersTotal}{' '}
                  <span className="text-sm font-medium text-stone-500">
                    ({overview.usersSuspended} khóa)
                  </span>
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-stone-500">Cộng đồng / Thiết bị ẩn</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {overview.communitiesTotal}{' '}
                  <span className="text-sm font-medium text-stone-500">
                    ({overview.gearHidden} đồ ẩn)
                  </span>
                </p>
              </Card>
            </div>
          )}

          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-stone-900">
              Nhật ký kiểm duyệt gần đây
            </h2>
            {!auditLogsData || auditLogsData.items.length === 0 ? (
              <p className="text-xs text-stone-500">Chưa có thao tác nào.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {auditLogsData.items.map((log) => (
                  <div
                    key={log.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-stone-900">
                        {log.actorName || log.actorId}
                      </span>{' '}
                      <span className="text-emerald-700 font-medium">
                        {log.action}
                      </span>{' '}
                      <span className="text-stone-600">
                        ({log.targetType} #{log.targetId.slice(-6)})
                      </span>
                      {log.reason && (
                        <p className="text-stone-500 mt-0.5">
                          Lý do: {log.reason}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-400 shrink-0">
                      {formatVietnamDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-3">
            <select
              value={reportStatus}
              onChange={(e) => {
                setReportStatus(e.target.value as ReportStatus | '');
                setReportPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="DISMISSED">DISMISSED</option>
            </select>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ReportTargetType | '');
                setReportPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
            >
              <option value="">Tất cả loại đối tượng</option>
              <option value="POST">POST</option>
              <option value="COMMENT">COMMENT</option>
              <option value="GEAR">GEAR</option>
              <option value="USER">USER</option>
              <option value="BOOKING">BOOKING</option>
            </select>
          </Card>

          {loadingReports ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : !reportsData || reportsData.items.length === 0 ? (
            <EmptyState
              icon={<Flag className="w-6 h-6" />}
              title="Không có báo cáo phù hợp"
              description="Chưa có báo cáo vi phạm nào khớp bộ lọc hiện tại."
            />
          ) : (
            <Card className="divide-y divide-stone-100">
              {reportsData.items.map((rep) => (
                <div key={rep.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="stone">{rep.targetType}</Badge>
                      <Badge
                        variant={
                          rep.status === 'RESOLVED'
                            ? 'emerald'
                            : rep.status === 'DISMISSED'
                              ? 'stone'
                              : 'demo'
                        }
                      >
                        {rep.status}
                      </Badge>
                      <span className="text-xs text-stone-500">
                        Người báo cáo: @{rep.reporter?.username || 'unknown'}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-400">
                      {formatVietnamDateTime(rep.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-stone-900">
                    Lý do: {rep.reason}
                  </p>
                  {rep.description && (
                    <p className="text-xs text-stone-600">{rep.description}</p>
                  )}
                  {rep.targetPreview && (
                    <div className="text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-700">
                      <span className="font-semibold">Đối tượng:</span>{' '}
                      {rep.targetPreview.label}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedReport(rep);
                        setDecisionStatus('RESOLVED');
                        setDecisionAction('HIDE_CONTENT');
                      }}
                    >
                      Xử lý báo cáo
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserPage(1);
                }}
                placeholder="Tìm theo tên, username hoặc email..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200"
              />
            </div>
            <select
              value={userStatus}
              onChange={(e) => {
                setUserStatus(e.target.value as AccountStatus | '');
                setUserPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="BANNED">BANNED</option>
            </select>
          </Card>

          {loadingUsers ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : !usersData || usersData.items.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="Không tìm thấy người dùng"
              description="Thử từ khóa khác."
            />
          ) : (
            <Card className="divide-y divide-stone-100">
              {usersData.items.map((u) => (
                <div
                  key={u.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-stone-900">
                        {u.fullName}
                      </span>
                      <Badge variant="stone">{u.role}</Badge>
                      <Badge
                        variant={u.status === 'ACTIVE' ? 'emerald' : 'demo'}
                      >
                        {u.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-stone-500">
                      @{u.username} • {u.email} • Uy tín: {u.trustScore}
                    </p>
                  </div>

                  {u.role !== 'ADMIN' && (
                    <Button
                      variant={u.status === 'ACTIVE' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => handleToggleUserStatus(u)}
                    >
                      {u.status === 'ACTIVE' ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          Tạm khóa
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          Mở khóa
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Content & Gear Tab */}
      {tab === 'content' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-3">
            <select
              value={contentType}
              onChange={(e) =>
                setContentType(e.target.value as 'POST' | 'COMMENT' | 'GEAR')
              }
              className="px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
            >
              <option value="POST">Bài viết (POST)</option>
              <option value="COMMENT">Bình luận (COMMENT)</option>
              <option value="GEAR">Thiết bị (GEAR)</option>
            </select>
            <select
              value={contentVis}
              onChange={(e) =>
                setContentVis(e.target.value as 'ALL' | 'VISIBLE' | 'HIDDEN')
              }
              className="px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
            >
              <option value="ALL">Tất cả</option>
              <option value="VISIBLE">Đang hiển thị</option>
              <option value="HIDDEN">Đang bị ẩn</option>
            </select>
            <input
              type="text"
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
              placeholder="Tìm nội dung hoặc tiêu đề..."
              className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl border border-stone-200"
            />
          </Card>

          {loadingContent ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : !contentData || contentData.items.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6" />}
              title="Không có dữ liệu phù hợp"
              description="Thử đổi loại nội dung hoặc từ khóa tìm kiếm."
            />
          ) : (
            <Card className="divide-y divide-stone-100">
              {contentData.items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="stone">{item.type}</Badge>
                      <Badge variant={item.isHidden ? 'demo' : 'emerald'}>
                        {item.isHidden ? 'ĐANG ẨN' : 'HIỂN THỊ'}
                      </Badge>
                      <span className="text-xs text-stone-500">
                        Tác giả: {item.authorName}
                      </span>
                    </div>
                    <p className="text-xs text-stone-800 truncate">
                      {item.titleOrExcerpt}
                    </p>
                    {item.hiddenReason && (
                      <p className="text-[11px] text-amber-700">
                        Lý do ẩn: {item.hiddenReason}
                      </p>
                    )}
                  </div>

                  <Button
                    variant={item.isHidden ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      handleModerateContentItem(
                        item,
                        item.isHidden ? 'RESTORE' : 'HIDE',
                      )
                    }
                  >
                    {item.isHidden ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Khôi phục
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Ẩn nội dung
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Disputes Tab */}
      {tab === 'disputes' && (
        <div className="space-y-4">
          {loadingDisputes ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : disputes.length === 0 ? (
            <EmptyState
              icon={<Scale className="w-6 h-6" />}
              title="Chưa có khiếu nại booking nào"
              description="Các khiếu nại giao dịch thuê thiết bị sẽ hiển thị tại đây."
            />
          ) : (
            <Card className="divide-y divide-stone-100">
              {disputes.map((d) => (
                <div key={d.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="demo">{d.status}</Badge>
                      {d.booking && (
                        <Link
                          to={`/bookings/${d.booking.id}`}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Booking {d.booking.bookingCode}
                        </Link>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-400">
                      {formatVietnamDateTime(d.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-stone-900">
                    Lý do: {d.reason}
                  </p>
                  {d.description && (
                    <p className="text-xs text-stone-600">{d.description}</p>
                  )}
                  {(d.status === 'OPEN' || d.status === 'UNDER_REVIEW') && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          handleResolveDispute(d, 'RESOLVED_RENTER')
                        }
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ưu tiên người thuê
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleResolveDispute(d, 'RESOLVED_OWNER')
                        }
                      >
                        Ưu tiên chủ thiết bị
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Handle Report Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-stone-900">
              Xử lý báo cáo ({selectedReport.targetType})
            </h3>
            <form onSubmit={handleSubmitReportDecision} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Trạng thái xử lý
                </label>
                <select
                  value={decisionStatus}
                  onChange={(e) =>
                    setDecisionStatus(e.target.value as ReportStatus)
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
                >
                  <option value="IN_REVIEW">IN_REVIEW (Đang xem xét)</option>
                  <option value="RESOLVED">RESOLVED (Đã xử lý)</option>
                  <option value="DISMISSED">DISMISSED (Bác bỏ)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Hành động lên nội dung
                </label>
                <select
                  value={decisionAction}
                  onChange={(e) =>
                    setDecisionAction(
                      e.target.value as
                        | 'NONE'
                        | 'HIDE_CONTENT'
                        | 'RESTORE_CONTENT'
                        | 'SUSPEND_USER',
                    )
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 bg-white"
                >
                  <option value="HIDE_CONTENT">
                    HIDE_CONTENT (Ẩn nội dung / thiết bị)
                  </option>
                  <option value="RESTORE_CONTENT">
                    RESTORE_CONTENT (Khôi phục hiển thị)
                  </option>
                  <option value="SUSPEND_USER">
                    SUSPEND_USER (Tạm khóa tài khoản)
                  </option>
                  <option value="NONE">NONE (Không thay đổi hiển thị)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Kết quả gửi cho người báo cáo
                </label>
                <textarea
                  rows={2}
                  value={publicOutcome}
                  onChange={(e) => setPublicOutcome(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Ghi chú nội bộ (chỉ Admin xem)
                </label>
                <textarea
                  rows={2}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Không hiển thị cho người báo cáo..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedReport(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={handlingReport}
                >
                  Xác nhận
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
