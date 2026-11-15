import {
  BadRequestException,
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
  Community,
  CommunityDocument,
  Dispute,
  DisputeDocument,
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
  DisputeStatus,
  GearModerationStatus,
  GearStatus,
  NotificationType,
  ReportStatus,
  UserRole,
} from '../../common/enums/system.enums';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminModerateContentDto,
  AdminResolveDisputeDto,
  UpdateUserAccountStatusDto,
} from './dto/admin-moderation.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(GearItem.name)
    private readonly gearModel: Model<GearItemDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Dispute.name)
    private readonly disputeModel: Model<DisputeDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(ModerationAuditLog.name)
    private readonly auditLogModel: Model<ModerationAuditLogDocument>,
    @Optional() private readonly bookingsService?: BookingsService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async getOverview() {
    const [
      totalUsers,
      suspendedUsers,
      totalPosts,
      hiddenPosts,
      totalGear,
      activeGear,
      hiddenGear,
      pendingReports,
      totalReports,
      openDisputes,
      totalDisputes,
      totalCommunities,
      recentAuditLogs,
    ] = await Promise.all([
      this.userModel.countDocuments({}),
      this.userModel.countDocuments({
        status: { $in: [AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED] },
      }),
      this.postModel.countDocuments({}),
      this.postModel.countDocuments({ isHidden: true }),
      this.gearModel.countDocuments({}),
      this.gearModel.countDocuments({
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
      }),
      this.gearModel.countDocuments({
        moderationStatus: GearModerationStatus.REJECTED,
      }),
      this.reportModel.countDocuments({
        status: {
          $in: [
            ReportStatus.PENDING,
            ReportStatus.OPEN,
            ReportStatus.IN_REVIEW,
          ],
        },
      }),
      this.reportModel.countDocuments({}),
      this.disputeModel.countDocuments({
        status: { $in: [DisputeStatus.OPEN, DisputeStatus.UNDER_MEDIATION] },
      }),
      this.disputeModel.countDocuments({}),
      this.communityModel.countDocuments({ isActive: { $ne: false } }),
      this.auditLogModel
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      metrics: {
        totalUsers,
        activeUsers: Math.max(0, totalUsers - suspendedUsers),
        suspendedUsers,
        totalPosts,
        hiddenPosts,
        totalGear,
        activeGear,
        hiddenGear,
        pendingReports,
        totalReports,
        openDisputes,
        totalDisputes,
        totalCommunities,
      },
      recentAuditLogs: recentAuditLogs.map((log: any) => ({
        id: String(log._id),
        actorId: String(log.actorId),
        actorRole: log.actorRole,
        scope: log.scope,
        targetType: log.targetType,
        targetId: String(log.targetId),
        action: log.action,
        reason: log.reason,
        createdAt: log.createdAt,
      })),
    };
  }

  async listUsers(params: {
    q?: string;
    status?: AccountStatus;
    role?: UserRole;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<UserDocument> = {};
    if (params.status) filter.status = params.status;
    if (params.role) filter.role = params.role;

    if (params.q && params.q.trim()) {
      const escaped = params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const matchedProfiles = await this.profileModel
        .find({ $or: [{ fullName: regex }, { username: regex }] })
        .select('userId')
        .lean();
      const matchedUserIds = matchedProfiles.map((p) => p.userId);
      filter.$or = [{ email: regex }, { _id: { $in: matchedUserIds } }];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    const userIds = users.map((u: any) => u._id);
    const profiles =
      userIds.length > 0
        ? await this.profileModel.find({ userId: { $in: userIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    return {
      items: users.map((u: any) => {
        const prof = profileMap.get(String(u._id));
        return {
          id: String(u._id),
          email: u.email,
          role: u.role,
          status: u.status,
          lastLoginAt: u.lastLoginAt || null,
          createdAt: u.createdAt,
          username: prof?.username || 'member',
          fullName: prof?.fullName || 'Thành viên TravelShare',
          avatarUrl: prof?.avatarUrl || '',
          city: prof?.city || 'Việt Nam',
          trustScore: prof?.trustScore ?? 5.0,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserAccountStatus(
    adminId: string,
    targetUserId: string,
    dto: UpdateUserAccountStatusDto,
  ) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (String(adminId) === String(targetUserId)) {
      throw new BadRequestException(
        'Bạn không thể tự khóa hoặc hủy kích hoạt tài khoản của chính mình',
      );
    }

    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const previousStatus = user.status;
    user.status = dto.status;
    if (dto.status !== AccountStatus.ACTIVE) {
      // Immediately revoke refresh sessions when locking/deactivating account
      user.refreshSessions = [];
    }
    await user.save();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(adminId),
      actorRole: 'ADMIN',
      scope: 'SYSTEM',
      targetType: 'USER',
      targetId: user._id as Types.ObjectId,
      action:
        dto.status === AccountStatus.ACTIVE
          ? 'ACTIVATE_USER'
          : `SET_USER_${dto.status}`,
      reason: dto.reason.trim(),
      metadata: { previousStatus, nextStatus: dto.status },
    });

    return {
      id: String(user._id),
      email: user.email,
      status: user.status,
      previousStatus,
    };
  }

  async listContentForModeration(params: {
    type?: 'POST' | 'COMMENT' | 'GEAR';
    q?: string;
    visibility?: 'ALL' | 'ACTIVE' | 'HIDDEN';
    page?: number;
    limit?: number;
  }) {
    const type = params.type || 'POST';
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;
    const visibility = params.visibility || 'ALL';
    const regex =
      params.q && params.q.trim()
        ? new RegExp(
            params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          )
        : null;

    if (type === 'POST') {
      const filter: FilterQuery<PostDocument> = {};
      if (visibility === 'ACTIVE') filter.isHidden = { $ne: true };
      if (visibility === 'HIDDEN') filter.isHidden = true;
      if (regex) filter.$or = [{ content: regex }, { locationName: regex }];

      const [docs, total] = await Promise.all([
        this.postModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.postModel.countDocuments(filter),
      ]);

      const authorIds = Array.from(
        new Set(docs.map((d: any) => String(d.authorId))),
      ).map((id) => new Types.ObjectId(id));
      const profiles =
        authorIds.length > 0
          ? await this.profileModel.find({ userId: { $in: authorIds } }).lean()
          : [];
      const profileMap = new Map(
        profiles.map((p: any) => [String(p.userId), p]),
      );

      return {
        type,
        items: docs.map((p: any) => {
          const prof = profileMap.get(String(p.authorId));
          return {
            id: String(p._id),
            targetType: 'POST',
            title: String(p.content || '').slice(0, 140),
            authorName: prof?.fullName || 'Thành viên TravelShare',
            authorUsername: prof?.username || 'member',
            isHidden: Boolean(p.isHidden),
            hiddenReason: p.hiddenReason || '',
            communityId: p.communityId ? String(p.communityId) : null,
            createdAt: p.createdAt,
          };
        }),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (type === 'COMMENT') {
      const filter: FilterQuery<CommentDocument> = {};
      if (visibility === 'ACTIVE') filter.isHidden = { $ne: true };
      if (visibility === 'HIDDEN') filter.isHidden = true;
      if (regex) filter.content = regex;

      const [docs, total] = await Promise.all([
        this.commentModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.commentModel.countDocuments(filter),
      ]);

      const authorIds = Array.from(
        new Set(docs.map((d: any) => String(d.authorId))),
      ).map((id) => new Types.ObjectId(id));
      const profiles =
        authorIds.length > 0
          ? await this.profileModel.find({ userId: { $in: authorIds } }).lean()
          : [];
      const profileMap = new Map(
        profiles.map((p: any) => [String(p.userId), p]),
      );

      return {
        type,
        items: docs.map((c: any) => {
          const prof = profileMap.get(String(c.authorId));
          return {
            id: String(c._id),
            postId: String(c.postId),
            targetType: 'COMMENT',
            title: String(c.content || '').slice(0, 140),
            authorName: prof?.fullName || 'Thành viên TravelShare',
            authorUsername: prof?.username || 'member',
            isHidden: Boolean(c.isHidden),
            hiddenReason: c.hiddenReason || '',
            createdAt: c.createdAt,
          };
        }),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    }

    // GEAR
    const filter: FilterQuery<GearItemDocument> = {};
    if (visibility === 'ACTIVE') {
      filter.moderationStatus = GearModerationStatus.APPROVED;
    } else if (visibility === 'HIDDEN') {
      filter.moderationStatus = GearModerationStatus.REJECTED;
    }
    if (regex) {
      filter.$or = [{ title: regex }, { categoryCode: regex }, { city: regex }];
    }

    const [docs, total] = await Promise.all([
      this.gearModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.gearModel.countDocuments(filter),
    ]);

    const ownerIds = Array.from(
      new Set(docs.map((d: any) => String(d.ownerId))),
    ).map((id) => new Types.ObjectId(id));
    const profiles =
      ownerIds.length > 0
        ? await this.profileModel.find({ userId: { $in: ownerIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    return {
      type: 'GEAR',
      items: docs.map((g: any) => {
        const prof = profileMap.get(String(g.ownerId));
        return {
          id: String(g._id),
          targetType: 'GEAR',
          title: g.title,
          categoryCode: g.categoryCode,
          authorName: prof?.fullName || 'Chủ thiết bị',
          authorUsername: prof?.username || 'owner',
          status: g.status,
          moderationStatus: g.moderationStatus,
          isHidden: g.moderationStatus !== GearModerationStatus.APPROVED,
          hiddenReason: g.moderationNote || '',
          createdAt: g.createdAt,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async moderateContent(
    adminId: string,
    targetType: 'POST' | 'COMMENT' | 'GEAR',
    targetId: string,
    dto: AdminModerateContentDto,
  ) {
    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException('Không tìm thấy đối tượng cần kiểm duyệt');
    }

    const isHide = dto.action === 'HIDE';
    const now = new Date();
    const reason = dto.reason.trim();

    if (targetType === 'POST') {
      const post = await this.postModel.findById(targetId);
      if (!post) throw new NotFoundException('Không tìm thấy bài viết');
      post.isHidden = isHide;
      post.hiddenReason = isHide ? reason : undefined;
      post.hiddenById = isHide ? new Types.ObjectId(adminId) : undefined;
      post.hiddenAt = isHide ? now : undefined;
      await post.save();
    } else if (targetType === 'COMMENT') {
      const comment = await this.commentModel.findById(targetId);
      if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
      comment.isHidden = isHide;
      comment.hiddenReason = isHide ? reason : undefined;
      comment.hiddenById = isHide ? new Types.ObjectId(adminId) : undefined;
      comment.hiddenAt = isHide ? now : undefined;
      await comment.save();
    } else if (targetType === 'GEAR') {
      const gear = await this.gearModel.findById(targetId);
      if (!gear) throw new NotFoundException('Không tìm thấy tin thiết bị');
      gear.moderationStatus = isHide
        ? GearModerationStatus.REJECTED
        : GearModerationStatus.APPROVED;
      (gear as any).moderationNote = reason;
      gear.isActive = !isHide && gear.status === GearStatus.ACTIVE;
      await gear.save();
    } else {
      throw new BadRequestException('Loại đối tượng không hợp lệ');
    }

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(adminId),
      actorRole: 'ADMIN',
      scope: 'SYSTEM',
      targetType,
      targetId: new Types.ObjectId(targetId),
      action: `${dto.action}_${targetType}`,
      reason,
    });

    return {
      targetType,
      targetId,
      isHidden: isHide,
      reason,
    };
  }

  async listDisputes() {
    const disputes = await this.disputeModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const bookingIds = disputes.map((d: any) => d.bookingId);
    const userIds = Array.from(
      new Set(
        disputes.flatMap((d: any) => [
          String(d.reporterId),
          String(d.reportedUserId),
        ]),
      ),
    ).map((id) => new Types.ObjectId(id));

    const [bookings, profiles] = await Promise.all([
      bookingIds.length > 0
        ? this.bookingModel.find({ _id: { $in: bookingIds } }).lean()
        : Promise.resolve([]),
      userIds.length > 0
        ? this.profileModel.find({ userId: { $in: userIds } }).lean()
        : Promise.resolve([]),
    ]);

    const bookingMap = new Map<string, any>(
      bookings.map((b: any) => [String(b._id), b] as [string, any]),
    );
    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );

    return disputes.map((d: any) => {
      const booking = bookingMap.get(String(d.bookingId));
      const reporter = profileMap.get(String(d.reporterId));
      const reported = profileMap.get(String(d.reportedUserId));
      return {
        id: String(d._id),
        bookingId: String(d.bookingId),
        bookingStatus: booking?.status || null,
        gearTitle: booking?.gearSnapshot?.title || 'Thiết bị giao dịch',
        rentalTotal: booking?.rentalTotal ?? 0,
        depositAmount: booking?.depositAmount ?? 0,
        reporterId: String(d.reporterId),
        reporterName: reporter?.fullName || 'Thành viên',
        reportedUserId: String(d.reportedUserId),
        reportedUserName: reported?.fullName || 'Thành viên',
        reason: d.reason,
        description: d.description,
        evidence: d.evidence || [],
        status: d.status,
        adminNotes: d.adminNotes || '',
        resolvedAt: d.resolvedAt || null,
        createdAt: d.createdAt,
      };
    });
  }

  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: AdminResolveDisputeDto,
  ) {
    if (!this.bookingsService) {
      throw new BadRequestException('BookingsService chưa sẵn sàng');
    }

    const result = await this.bookingsService.resolveDispute(
      disputeId,
      adminId,
      UserRole.ADMIN,
      dto,
    );

    const dispute: any = await this.disputeModel.findById(disputeId).lean();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(adminId),
      actorRole: 'ADMIN',
      scope: 'SYSTEM',
      targetType: 'DISPUTE',
      targetId: new Types.ObjectId(disputeId),
      action: `RESOLVE_DISPUTE_${dto.status}`,
      reason: dto.adminNotes.trim(),
      metadata: { bookingId: result.bookingId },
    });

    if (this.notificationsService && dispute) {
      const recipients = [
        String(dispute.reporterId),
        String(dispute.reportedUserId),
      ];
      await Promise.all(
        recipients.map((recipientId) =>
          this.notificationsService!.createIdempotentNotification({
            recipientId,
            actorId: adminId,
            bookingId: String(dispute.bookingId),
            type: NotificationType.DISPUTE_UPDATED,
            dedupeKey: `dispute:${disputeId}:${dto.status}:${recipientId}`,
            title: 'Tranh chấp giao dịch đã được quản trị viên cập nhật',
            body: `Kết quả xử lý: ${dto.status} — ${dto.adminNotes.trim()}`,
            targetUrl: `/bookings/${String(dispute.bookingId)}`,
          }),
        ),
      ).catch(() => undefined);
    }

    return result;
  }

  async listAuditLogs(page = 1, limit = 30) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const skip = (safePage - 1) * safeLimit;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.auditLogModel.countDocuments({}),
    ]);

    const actorIds = Array.from(
      new Set(logs.map((l: any) => String(l.actorId))),
    ).map((id) => new Types.ObjectId(id));
    const profiles =
      actorIds.length > 0
        ? await this.profileModel.find({ userId: { $in: actorIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    return {
      items: logs.map((l: any) => {
        const prof = profileMap.get(String(l.actorId));
        return {
          id: String(l._id),
          actorId: String(l.actorId),
          actorName: prof?.fullName || 'Quản trị viên',
          actorRole: l.actorRole,
          scope: l.scope,
          communityId: l.communityId ? String(l.communityId) : null,
          targetType: l.targetType,
          targetId: String(l.targetId),
          action: l.action,
          reason: l.reason,
          metadata: l.metadata || {},
          createdAt: l.createdAt,
        };
      }),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
