import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
  Comment,
  CommentDocument,
  CommunityMember,
  CommunityMemberDocument,
  GearItem,
  GearItemDocument,
  ModerationAuditLog,
  ModerationAuditLogDocument,
  Post,
  PostDocument,
  Profile,
  ProfileDocument,
  Report,
  ReportDocument,
  User,
  UserDocument,
} from '../../database/schemas';
import {
  AccountStatus,
  CommunityRole,
  GearModerationStatus,
  GearStatus,
  NotificationType,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from '../../common/enums/system.enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateReportDto,
  HandleReportDto,
  QueryReportsDto,
} from './dto/admin-moderation.dto';

const OPEN_REPORT_STATUSES = [
  ReportStatus.PENDING,
  ReportStatus.OPEN,
  ReportStatus.IN_REVIEW,
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(GearItem.name)
    private readonly gearModel: Model<GearItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(CommunityMember.name)
    private readonly communityMemberModel: Model<CommunityMemberDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(ModerationAuditLog.name)
    private readonly auditLogModel: Model<ModerationAuditLogDocument>,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Safe projection for the reporter / public — NEVER exposes internalNote or other reporters' info.
   */
  formatReporterReport(r: any) {
    return {
      id: String(r._id),
      targetType: r.targetType,
      targetId: String(r.targetId),
      communityId: r.communityId ? String(r.communityId) : null,
      reason: r.reason,
      description: r.description || '',
      status: r.status,
      publicOutcome: r.publicOutcome || null,
      actionTaken: r.actionTaken || null,
      resolvedAt: r.resolvedAt || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!Types.ObjectId.isValid(dto.targetId)) {
      throw new NotFoundException('Đối tượng báo cáo không tồn tại');
    }

    const targetObjId = new Types.ObjectId(dto.targetId);
    const reporterObjId = new Types.ObjectId(reporterId);
    let communityId: Types.ObjectId | undefined;

    if (dto.targetType === ReportTargetType.POST) {
      const post = await this.postModel.findById(targetObjId).lean();
      if (!post) {
        throw new NotFoundException('Không tìm thấy bài viết để báo cáo');
      }
      if (post.communityId) {
        communityId = post.communityId;
      }
    } else if (dto.targetType === ReportTargetType.COMMENT) {
      const comment = await this.commentModel.findById(targetObjId).lean();
      if (!comment) {
        throw new NotFoundException('Không tìm thấy bình luận để báo cáo');
      }
      const parentPost = await this.postModel.findById(comment.postId).lean();
      if (parentPost?.communityId) {
        communityId = parentPost.communityId;
      }
    } else if (dto.targetType === ReportTargetType.GEAR) {
      const gear = await this.gearModel.findById(targetObjId).lean();
      if (!gear) {
        throw new NotFoundException('Không tìm thấy thiết bị để báo cáo');
      }
    } else if (dto.targetType === ReportTargetType.USER) {
      if (String(targetObjId) === String(reporterObjId)) {
        throw new BadRequestException('Bạn không thể tự báo cáo tài khoản của chính mình');
      }
      const user = await this.userModel.findById(targetObjId).lean();
      if (!user) {
        throw new NotFoundException('Không tìm thấy người dùng để báo cáo');
      }
    } else if (dto.targetType === ReportTargetType.BOOKING) {
      const booking = await this.bookingModel.findById(targetObjId).lean();
      if (!booking) {
        throw new NotFoundException('Không tìm thấy giao dịch để báo cáo');
      }
      if (
        String(booking.renterId) !== String(reporterObjId) &&
        String(booking.ownerId) !== String(reporterObjId)
      ) {
        throw new ForbiddenException(
          'Bạn không có quyền báo cáo giao dịch không liên quan đến mình',
        );
      }
    }

    // Deduplicate open reports from the same reporter for the same target
    const existingOpen = await this.reportModel
      .findOne({
        reporterId: reporterObjId,
        targetType: dto.targetType,
        targetId: targetObjId,
        status: { $in: OPEN_REPORT_STATUSES },
      })
      .lean();

    if (existingOpen) {
      return {
        ...this.formatReporterReport(existingOpen),
        deduplicated: true,
      };
    }

    const created = await this.reportModel.create({
      reporterId: reporterObjId,
      targetType: dto.targetType,
      targetId: targetObjId,
      ...(communityId ? { communityId } : {}),
      reason: dto.reason.trim(),
      description: dto.description?.trim() || '',
      status: ReportStatus.PENDING,
    });

    return {
      ...this.formatReporterReport(created.toObject()),
      deduplicated: false,
    };
  }

  async listMyReports(reporterId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const filter = { reporterId: new Types.ObjectId(reporterId) };

    const [docs, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      items: docs.map((r) => this.formatReporterReport(r)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async listModerationReports(
    actorId: string,
    systemRole: string,
    query: QueryReportsDto,
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<ReportDocument> = {};
    const isSystemAdmin = systemRole === UserRole.ADMIN;

    if (!isSystemAdmin) {
      const moderatedMemberships = await this.communityMemberModel
        .find({
          userId: new Types.ObjectId(actorId),
          role: { $in: [CommunityRole.OWNER, CommunityRole.MODERATOR] },
        })
        .select('communityId')
        .lean();

      if (moderatedMemberships.length === 0) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập hàng đợi báo cáo kiểm duyệt',
        );
      }

      const modCommunityIds = moderatedMemberships.map((m) => m.communityId);
      if (query.communityId) {
        if (
          !Types.ObjectId.isValid(query.communityId) ||
          !modCommunityIds.some((id) => String(id) === query.communityId)
        ) {
          throw new ForbiddenException(
            'Moderator chỉ được xem báo cáo trong cộng đồng mình quản lý',
          );
        }
        filter.communityId = new Types.ObjectId(query.communityId);
      } else {
        filter.communityId = { $in: modCommunityIds };
      }

      filter.targetType = {
        $in: [ReportTargetType.POST, ReportTargetType.COMMENT],
      };
    } else if (query.communityId && Types.ObjectId.isValid(query.communityId)) {
      filter.communityId = new Types.ObjectId(query.communityId);
    }

    if (query.targetType) {
      if (
        !isSystemAdmin &&
        query.targetType !== ReportTargetType.POST &&
        query.targetType !== ReportTargetType.COMMENT
      ) {
        throw new ForbiddenException(
          'Moderator cộng đồng chỉ xử lý báo cáo bài viết và bình luận trong nhóm',
        );
      }
      filter.targetType = query.targetType;
    }

    if (query.status) {
      if (query.status === ReportStatus.PENDING) {
        filter.status = { $in: [ReportStatus.PENDING, ReportStatus.OPEN] };
      } else {
        filter.status = query.status;
      }
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!isNaN(fromDate.getTime())) {
          filter.createdAt.$gte = fromDate;
        }
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!isNaN(toDate.getTime())) {
          filter.createdAt.$lte = toDate;
        }
      }
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    const [docs, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);

    const reporterIds = Array.from(
      new Set(docs.map((d: any) => String(d.reporterId))),
    ).map((id) => new Types.ObjectId(id));
    const profiles =
      reporterIds.length > 0
        ? await this.profileModel.find({ userId: { $in: reporterIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    const items = await Promise.all(
      docs.map(async (r: any) => {
        const reporterProfile = profileMap.get(String(r.reporterId));
        const targetPreview = await this.loadTargetPreview(
          r.targetType,
          r.targetId,
        );
        return {
          id: String(r._id),
          reporterId: String(r.reporterId),
          reporter: {
            userId: String(r.reporterId),
            username: reporterProfile?.username || 'member',
            fullName: reporterProfile?.fullName || 'Thành viên TravelShare',
          },
          targetType: r.targetType,
          targetId: String(r.targetId),
          targetPreview,
          communityId: r.communityId ? String(r.communityId) : null,
          reason: r.reason,
          description: r.description || '',
          status: r.status,
          resolvedByAdminId: r.resolvedByAdminId
            ? String(r.resolvedByAdminId)
            : null,
          resolvedAt: r.resolvedAt || null,
          resolutionNote: r.resolutionNote || '',
          internalNote: r.internalNote || '',
          publicOutcome: r.publicOutcome || '',
          actionTaken: r.actionTaken || 'NONE',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      }),
    );

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async loadTargetPreview(
    targetType: ReportTargetType,
    targetId: Types.ObjectId,
  ) {
    if (targetType === ReportTargetType.POST) {
      const p: any = await this.postModel.findById(targetId).lean();
      if (!p) return { exists: false, label: 'Bài viết đã bị xóa' };
      return {
        exists: true,
        label: String(p.content || '').slice(0, 120),
        isHidden: Boolean(p.isHidden),
      };
    }
    if (targetType === ReportTargetType.COMMENT) {
      const c: any = await this.commentModel.findById(targetId).lean();
      if (!c) return { exists: false, label: 'Bình luận đã bị xóa' };
      return {
        exists: true,
        label: String(c.content || '').slice(0, 120),
        isHidden: Boolean(c.isHidden),
        postId: String(c.postId),
      };
    }
    if (targetType === ReportTargetType.GEAR) {
      const g: any = await this.gearModel.findById(targetId).lean();
      if (!g) return { exists: false, label: 'Thiết bị không tồn tại' };
      return {
        exists: true,
        label: g.title,
        isHidden:
          g.moderationStatus !== GearModerationStatus.APPROVED || !g.isActive,
        moderationStatus: g.moderationStatus,
      };
    }
    if (targetType === ReportTargetType.USER) {
      const u: any = await this.userModel.findById(targetId).lean();
      const prof: any = await this.profileModel
        .findOne({ userId: targetId })
        .lean();
      if (!u) return { exists: false, label: 'Tài khoản không tồn tại' };
      return {
        exists: true,
        label: prof?.fullName || u.email,
        accountStatus: u.status,
      };
    }
    return { exists: true, label: String(targetId) };
  }

  async handleReport(
    reportId: string,
    actorId: string,
    systemRole: string,
    dto: HandleReportDto,
  ) {
    if (!Types.ObjectId.isValid(reportId)) {
      throw new NotFoundException('Không tìm thấy báo cáo');
    }

    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new NotFoundException('Không tìm thấy báo cáo');
    }

    const isSystemAdmin = systemRole === UserRole.ADMIN;
    let actorScopeRole = 'ADMIN';

    if (!isSystemAdmin) {
      // Community moderator can ONLY handle POST/COMMENT belonging to a community they moderate/own
      if (
        !report.communityId ||
        (report.targetType !== ReportTargetType.POST &&
          report.targetType !== ReportTargetType.COMMENT)
      ) {
        throw new ForbiddenException(
          'Chỉ quản trị viên hệ thống mới có quyền xử lý loại báo cáo này',
        );
      }

      const membership = await this.communityMemberModel
        .findOne({
          communityId: report.communityId,
          userId: new Types.ObjectId(actorId),
          role: { $in: [CommunityRole.OWNER, CommunityRole.MODERATOR] },
        })
        .lean();

      if (!membership) {
        throw new ForbiddenException(
          'Bạn không có quyền kiểm duyệt báo cáo của cộng đồng khác',
        );
      }
      actorScopeRole = membership.role;
    }

    const action = dto.action || 'NONE';
    if (action === 'SUSPEND_USER' && !isSystemAdmin) {
      throw new ForbiddenException(
        'Chỉ quản trị viên hệ thống mới có quyền khóa tài khoản',
      );
    }

    // Apply content/user moderation action if requested
    const now = new Date();
    const actionReason =
      dto.publicOutcome?.trim() ||
      dto.internalNote?.trim() ||
      `Xử lý báo cáo #${String(report._id)}`;

    if (action === 'HIDE_CONTENT' || action === 'RESTORE_CONTENT') {
      const isHide = action === 'HIDE_CONTENT';
      if (report.targetType === ReportTargetType.POST) {
        await this.postModel.updateOne(
          { _id: report.targetId },
          {
            $set: {
              isHidden: isHide,
              hiddenReason: isHide ? actionReason : null,
              hiddenById: isHide ? new Types.ObjectId(actorId) : null,
              hiddenAt: isHide ? now : null,
            },
          },
        );
      } else if (report.targetType === ReportTargetType.COMMENT) {
        await this.commentModel.updateOne(
          { _id: report.targetId },
          {
            $set: {
              isHidden: isHide,
              hiddenReason: isHide ? actionReason : null,
              hiddenById: isHide ? new Types.ObjectId(actorId) : null,
              hiddenAt: isHide ? now : null,
            },
          },
        );
      } else if (report.targetType === ReportTargetType.GEAR) {
        const gear = await this.gearModel.findById(report.targetId);
        if (gear) {
          gear.moderationStatus = isHide
            ? GearModerationStatus.REJECTED
            : GearModerationStatus.APPROVED;
          (gear as any).moderationNote = actionReason;
          gear.isActive = !isHide && gear.status === GearStatus.ACTIVE;
          await gear.save();
        }
      }
    } else if (
      action === 'SUSPEND_USER' &&
      report.targetType === ReportTargetType.USER
    ) {
      await this.userModel.updateOne(
        { _id: report.targetId },
        {
          $set: {
            status: AccountStatus.SUSPENDED,
            refreshSessions: [],
          },
        },
      );
    }

    const defaultPublicOutcome =
      dto.status === ReportStatus.RESOLVED
        ? action === 'HIDE_CONTENT'
          ? 'Báo cáo đã được xử lý: nội dung vi phạm đã bị ẩn.'
          : 'Báo cáo của bạn đã được xem xét và xử lý.'
        : dto.status === ReportStatus.DISMISSED
          ? 'Báo cáo đã được xem xét và không phát hiện vi phạm.'
          : 'Báo cáo của bạn đang được bộ phận kiểm duyệt xem xét.';

    report.status = dto.status;
    report.resolvedByAdminId = new Types.ObjectId(actorId);
    report.internalNote = dto.internalNote?.trim() || report.internalNote;
    report.publicOutcome = dto.publicOutcome?.trim() || defaultPublicOutcome;
    report.resolutionNote = report.publicOutcome;
    report.actionTaken = action;
    if (
      dto.status === ReportStatus.RESOLVED ||
      dto.status === ReportStatus.DISMISSED
    ) {
      report.resolvedAt = now;
    }

    await report.save();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(actorId),
      actorRole: actorScopeRole,
      scope: isSystemAdmin && !report.communityId ? 'SYSTEM' : 'COMMUNITY',
      ...(report.communityId ? { communityId: report.communityId } : {}),
      targetType: report.targetType,
      targetId: report.targetId,
      action: `REPORT_${dto.status}_${action}`,
      reason: actionReason,
      metadata: {
        reportId: String(report._id),
      },
    });

    // Notify the reporter ONLY after decision is persisted successfully (never expose internalNote)
    if (
      this.notificationsService &&
      (dto.status === ReportStatus.RESOLVED ||
        dto.status === ReportStatus.DISMISSED)
    ) {
      const isResolved = dto.status === ReportStatus.RESOLVED;
      await this.notificationsService
        .createIdempotentNotification({
          recipientId: String(report.reporterId),
          actorId,
          type: isResolved
            ? NotificationType.REPORT_RESOLVED
            : NotificationType.REPORT_DISMISSED,
          dedupeKey: `report:${String(report._id)}:decision:${dto.status}:${now.getTime()}`,
          title: isResolved
            ? 'Báo cáo vi phạm đã được xử lý'
            : 'Kết quả xem xét báo cáo vi phạm',
          body: report.publicOutcome || defaultPublicOutcome,
          targetUrl: '/notifications',
        })
        .catch(() => undefined);
    }

    return {
      id: String(report._id),
      status: report.status,
      actionTaken: report.actionTaken,
      publicOutcome: report.publicOutcome,
      internalNote: report.internalNote || '',
      resolvedAt: report.resolvedAt || null,
    };
  }
}
