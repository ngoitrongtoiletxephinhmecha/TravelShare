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
  Comment,
  CommentDocument,
  Community,
  CommunityDocument,
  CommunityMember,
  CommunityMemberDocument,
  ModerationAuditLog,
  ModerationAuditLogDocument,
  Post,
  PostDocument,
  Profile,
  ProfileDocument,
} from '../../database/schemas';
import {
  ActivityType,
  CommunityRole,
  normalizeLegacyActivity,
  UserRole,
} from '../../common/enums/system.enums';
import {
  AssignCommunityRoleDto,
  CommunityModerateContentDto,
  CreateCommunityDto,
  QueryCommunitiesDto,
  TransferOwnershipDto,
  UpdateCommunityRulesDto,
} from './dto/community.dto';
import { PostsService } from '../posts/posts.service';
import { QueryPostsDto } from '../posts/dto/post.dto';

@Injectable()
export class CommunitiesService {
  constructor(
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(CommunityMember.name)
    private readonly memberModel: Model<CommunityMemberDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(ModerationAuditLog.name)
    private readonly auditLogModel: Model<ModerationAuditLogDocument>,
    @Optional() private readonly postsService?: PostsService,
  ) {}

  private async findCommunityOrFail(slugOrId: string) {
    const query = Types.ObjectId.isValid(slugOrId)
      ? { $or: [{ _id: new Types.ObjectId(slugOrId) }, { slug: slugOrId }] }
      : { slug: slugOrId };
    const community = await this.communityModel.findOne(query).lean();
    if (!community || community.isActive === false) {
      throw new NotFoundException('Không tìm thấy cộng đồng');
    }
    return community;
  }

  private async getMembership(communityId: Types.ObjectId, userId?: string) {
    if (!userId || !Types.ObjectId.isValid(userId)) return null;
    return this.memberModel
      .findOne({
        communityId,
        userId: new Types.ObjectId(userId),
      })
      .lean();
  }

  private async assertCommunityRole(
    communityId: Types.ObjectId,
    userId: string,
    systemRole: string,
    allowedRoles: CommunityRole[],
  ) {
    if (systemRole === UserRole.ADMIN) {
      return { role: CommunityRole.OWNER, isSystemAdmin: true };
    }
    const membership = await this.getMembership(communityId, userId);
    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'Bạn không có quyền quản trị hoặc kiểm duyệt trong cộng đồng này',
      );
    }
    return { role: membership.role, isSystemAdmin: false };
  }

  async listCommunities(query: QueryCommunitiesDto, currentUserId?: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<CommunityDocument> = {
      isActive: { $ne: false },
    };

    if (query.activityType) {
      filter.activityType = query.activityType;
    }

    if (query.q && query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }

    let userMemberships: any[] = [];
    if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
      userMemberships = await this.memberModel
        .find({ userId: new Types.ObjectId(currentUserId) })
        .lean();
    }

    const membershipMap = new Map<string, CommunityRole>(
      userMemberships.map((m: any) => [String(m.communityId), m.role]),
    );

    if (query.joinedOnly) {
      if (!currentUserId || userMemberships.length === 0) {
        return {
          items: [],
          page,
          limit,
          total: 0,
          totalPages: 0,
        };
      }
      filter._id = {
        $in: userMemberships.map((m: any) => m.communityId),
      };
    }

    const [docs, total] = await Promise.all([
      this.communityModel
        .find(filter)
        .sort({ membersCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.communityModel.countDocuments(filter),
    ]);

    const items = docs.map((c: any) => {
      const myRole = membershipMap.get(String(c._id)) || null;
      return {
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        description: c.description,
        coverUrl: c.coverUrl || '',
        avatarUrl: c.avatarUrl || c.coverUrl || '',
        activityType:
          normalizeLegacyActivity(c.activityType).activity ||
          ActivityType.TREKKING,
        rules: c.rules || [],
        ownerId: String(c.ownerId),
        membersCount: c.membersCount ?? 0,
        isDemo: Boolean(c.isDemo),
        isJoined: Boolean(myRole),
        myRole,
        createdAt: c.createdAt,
      };
    });

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCommunityBySlug(slugOrId: string, currentUserId?: string) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const membership = await this.getMembership(community._id, currentUserId);

    const modMemberships = await this.memberModel
      .find({
        communityId: community._id,
        role: { $in: [CommunityRole.OWNER, CommunityRole.MODERATOR] },
      })
      .lean();

    const modUserIds = modMemberships.map((m: any) => m.userId);
    const profiles =
      modUserIds.length > 0
        ? await this.profileModel.find({ userId: { $in: modUserIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    const moderators = modMemberships.map((m: any) => {
      const prof = profileMap.get(String(m.userId));
      return {
        userId: String(m.userId),
        role: m.role,
        username: prof?.username || 'member',
        fullName: prof?.fullName || 'Thành viên TravelShare',
        avatarUrl: prof?.avatarUrl || '',
      };
    });

    const postsCount = await this.postModel.countDocuments({
      communityId: community._id,
      isHidden: { $ne: true },
    });

    return {
      id: String(community._id),
      slug: community.slug,
      name: community.name,
      description: community.description,
      coverUrl: community.coverUrl || '',
      avatarUrl: community.avatarUrl || community.coverUrl || '',
      activityType:
        normalizeLegacyActivity(community.activityType).activity ||
        ActivityType.TREKKING,
      rules: community.rules || [],
      ownerId: String(community.ownerId),
      membersCount: community.membersCount ?? 0,
      postsCount,
      isDemo: Boolean(community.isDemo),
      isJoined: Boolean(membership),
      myRole: membership?.role || null,
      moderators,
      createdAt: community.createdAt,
    };
  }

  async createCommunity(userId: string, dto: CreateCommunityDto) {
    const baseSlug = dto.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    let slug = baseSlug || `community-${Date.now()}`;
    const existing = await this.communityModel.findOne({ slug }).lean();
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const userObjId = new Types.ObjectId(userId);
    const created = await this.communityModel.create({
      slug,
      name: dto.name.trim(),
      description: dto.description.trim(),
      coverUrl: dto.coverUrl?.trim() || '',
      avatarUrl: dto.avatarUrl?.trim() || dto.coverUrl?.trim() || '',
      activityType: dto.activityType || ActivityType.TREKKING,
      rules: (dto.rules || []).map((r) => r.trim()).filter(Boolean),
      ownerId: userObjId,
      membersCount: 1,
      isActive: true,
      isDemo: false,
    });

    await this.memberModel.create({
      communityId: created._id,
      userId: userObjId,
      role: CommunityRole.OWNER,
    });

    return this.getCommunityBySlug(String(created._id), userId);
  }

  /**
   * Idempotent join: duplicate join requests for the same (communityId, userId)
   * only keep a single CommunityMember record and do not double-count membersCount.
   */
  async joinCommunity(userId: string, slugOrId: string) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const userObjId = new Types.ObjectId(userId);

    const existing = await this.memberModel
      .findOne({ communityId: community._id, userId: userObjId })
      .lean();

    if (existing) {
      return {
        joined: true,
        alreadyJoined: true,
        communityId: String(community._id),
        role: existing.role,
        membersCount: community.membersCount ?? 1,
      };
    }

    try {
      await this.memberModel.create({
        communityId: community._id,
        userId: userObjId,
        role: CommunityRole.MEMBER,
      });

      const updated = await this.communityModel
        .findByIdAndUpdate(
          community._id,
          { $inc: { membersCount: 1 } },
          { new: true },
        )
        .lean();

      return {
        joined: true,
        alreadyJoined: false,
        communityId: String(community._id),
        role: CommunityRole.MEMBER,
        membersCount: updated?.membersCount ?? (community.membersCount || 0) + 1,
      };
    } catch (err: any) {
      // Handle concurrent unique index collision (11000)
      if (err?.code === 11000) {
        const latest = await this.communityModel.findById(community._id).lean();
        const mem = await this.memberModel
          .findOne({ communityId: community._id, userId: userObjId })
          .lean();
        return {
          joined: true,
          alreadyJoined: true,
          communityId: String(community._id),
          role: mem?.role || CommunityRole.MEMBER,
          membersCount: latest?.membersCount ?? community.membersCount,
        };
      }
      throw err;
    }
  }

  async leaveCommunity(userId: string, slugOrId: string) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const userObjId = new Types.ObjectId(userId);

    const existing = await this.memberModel
      .findOne({ communityId: community._id, userId: userObjId })
      .lean();

    if (!existing) {
      return {
        joined: false,
        communityId: String(community._id),
        membersCount: community.membersCount ?? 0,
      };
    }

    if (existing.role === CommunityRole.OWNER) {
      throw new BadRequestException(
        'Chủ nhóm (OWNER) cần chuyển quyền sở hữu cho thành viên khác trước khi rời nhóm đang hoạt động',
      );
    }

    await this.memberModel.deleteOne({ _id: existing._id });
    const nextCount = Math.max(0, (community.membersCount || 1) - 1);
    await this.communityModel.updateOne(
      { _id: community._id },
      { $set: { membersCount: nextCount } },
    );

    return {
      joined: false,
      communityId: String(community._id),
      membersCount: nextCount,
    };
  }

  async updateRules(
    userId: string,
    systemRole: string,
    slugOrId: string,
    dto: UpdateCommunityRulesDto,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    await this.assertCommunityRole(community._id, userId, systemRole, [
      CommunityRole.OWNER,
    ]);

    const nextRules = dto.rules.map((r) => r.trim()).filter(Boolean);
    const updateSet: Record<string, any> = { rules: nextRules };
    if (dto.description !== undefined && dto.description.trim()) {
      updateSet.description = dto.description.trim();
    }

    await this.communityModel.updateOne(
      { _id: community._id },
      { $set: updateSet },
    );

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(userId),
      actorRole: systemRole === UserRole.ADMIN ? 'ADMIN' : CommunityRole.OWNER,
      scope: 'COMMUNITY',
      communityId: community._id,
      targetType: 'COMMUNITY',
      targetId: community._id,
      action: 'UPDATE_COMMUNITY_RULES',
      reason: 'Cập nhật nội quy cộng đồng',
      metadata: { rulesCount: nextRules.length },
    });

    return this.getCommunityBySlug(String(community._id), userId);
  }

  async listMembers(slugOrId: string, page = 1, limit = 30) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const skip = (safePage - 1) * safeLimit;

    const [members, total] = await Promise.all([
      this.memberModel
        .find({ communityId: community._id })
        .sort({ role: 1, createdAt: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.memberModel.countDocuments({ communityId: community._id }),
    ]);

    const userIds = members.map((m: any) => m.userId);
    const profiles =
      userIds.length > 0
        ? await this.profileModel.find({ userId: { $in: userIds } }).lean()
        : [];
    const profileMap = new Map(
      profiles.map((p: any) => [String(p.userId), p]),
    );

    return {
      items: members.map((m: any) => {
        const prof = profileMap.get(String(m.userId));
        return {
          userId: String(m.userId),
          role: m.role,
          joinedAt: m.createdAt,
          username: prof?.username || 'member',
          fullName: prof?.fullName || 'Thành viên TravelShare',
          avatarUrl: prof?.avatarUrl || '',
          city: prof?.city || 'Việt Nam',
        };
      }),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async assignMemberRole(
    actorId: string,
    systemRole: string,
    slugOrId: string,
    targetUserId: string,
    dto: AssignCommunityRoleDto,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    await this.assertCommunityRole(community._id, actorId, systemRole, [
      CommunityRole.OWNER,
    ]);

    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }

    if (
      dto.role !== CommunityRole.MODERATOR &&
      dto.role !== CommunityRole.MEMBER
    ) {
      throw new BadRequestException(
        'Chỉ có thể bổ nhiệm MODERATOR hoặc chuyển về MEMBER. Dùng transfer-ownership để chuyển quyền OWNER.',
      );
    }

    const member = await this.memberModel.findOne({
      communityId: community._id,
      userId: new Types.ObjectId(targetUserId),
    });

    if (!member) {
      throw new NotFoundException('Người dùng chưa phải thành viên cộng đồng này');
    }
    if (member.role === CommunityRole.OWNER) {
      throw new BadRequestException(
        'Không thể hạ quyền của OWNER. Hãy chuyển quyền sở hữu trước.',
      );
    }

    member.role = dto.role;
    await member.save();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(actorId),
      actorRole: systemRole === UserRole.ADMIN ? 'ADMIN' : CommunityRole.OWNER,
      scope: 'COMMUNITY',
      communityId: community._id,
      targetType: 'USER',
      targetId: new Types.ObjectId(targetUserId),
      action:
        dto.role === CommunityRole.MODERATOR
          ? 'ASSIGN_MODERATOR'
          : 'REVOKE_MODERATOR',
      reason: `Cập nhật vai trò thành viên trong nhóm thành ${dto.role}`,
    });

    return {
      communityId: String(community._id),
      userId: targetUserId,
      role: member.role,
    };
  }

  async transferOwnership(
    actorId: string,
    systemRole: string,
    slugOrId: string,
    dto: TransferOwnershipDto,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    await this.assertCommunityRole(community._id, actorId, systemRole, [
      CommunityRole.OWNER,
    ]);

    if (!Types.ObjectId.isValid(dto.newOwnerId)) {
      throw new BadRequestException('newOwnerId không hợp lệ');
    }

    const newOwnerObjId = new Types.ObjectId(dto.newOwnerId);
    const targetMember = await this.memberModel.findOne({
      communityId: community._id,
      userId: newOwnerObjId,
    });
    if (!targetMember) {
      throw new BadRequestException(
        'Người nhận quyền sở hữu phải là thành viên của cộng đồng này',
      );
    }

    await Promise.all([
      this.memberModel.updateOne(
        { communityId: community._id, userId: community.ownerId },
        { $set: { role: CommunityRole.MODERATOR } },
      ),
      this.memberModel.updateOne(
        { _id: targetMember._id },
        { $set: { role: CommunityRole.OWNER } },
      ),
      this.communityModel.updateOne(
        { _id: community._id },
        { $set: { ownerId: newOwnerObjId } },
      ),
    ]);

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(actorId),
      actorRole: systemRole === UserRole.ADMIN ? 'ADMIN' : CommunityRole.OWNER,
      scope: 'COMMUNITY',
      communityId: community._id,
      targetType: 'COMMUNITY',
      targetId: community._id,
      action: 'TRANSFER_OWNERSHIP',
      reason: `Chuyển quyền OWNER cộng đồng sang user ${dto.newOwnerId}`,
      metadata: { newOwnerId: dto.newOwnerId },
    });

    return this.getCommunityBySlug(String(community._id), actorId);
  }

  async getCommunityPosts(
    slugOrId: string,
    query: QueryPostsDto,
    viewerId?: string,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    if (!this.postsService) {
      return { items: [], nextCursor: null, hasMore: false };
    }
    return this.postsService.getPostsFeed(
      { ...query, communityId: String(community._id) },
      viewerId,
    );
  }

  async moderateCommunityPost(
    actorId: string,
    systemRole: string,
    slugOrId: string,
    postId: string,
    dto: CommunityModerateContentDto,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const { role } = await this.assertCommunityRole(
      community._id,
      actorId,
      systemRole,
      [CommunityRole.OWNER, CommunityRole.MODERATOR],
    );

    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    if (!post.communityId || String(post.communityId) !== String(community._id)) {
      throw new ForbiddenException(
        'Moderator chỉ được kiểm duyệt bài viết thuộc cộng đồng mình quản lý',
      );
    }

    const isHide = dto.action === 'HIDE';
    post.isHidden = isHide;
    post.hiddenReason = isHide ? dto.reason.trim() : undefined;
    post.hiddenById = isHide ? new Types.ObjectId(actorId) : undefined;
    post.hiddenAt = isHide ? new Date() : undefined;
    await post.save();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(actorId),
      actorRole: role,
      scope: 'COMMUNITY',
      communityId: community._id,
      targetType: 'POST',
      targetId: post._id as Types.ObjectId,
      action: isHide ? 'HIDE_POST' : 'RESTORE_POST',
      reason: dto.reason.trim(),
    });

    return {
      postId: String(post._id),
      communityId: String(community._id),
      isHidden: post.isHidden,
      hiddenReason: post.hiddenReason || null,
    };
  }

  async moderateCommunityComment(
    actorId: string,
    systemRole: string,
    slugOrId: string,
    commentId: string,
    dto: CommunityModerateContentDto,
  ) {
    const community: any = await this.findCommunityOrFail(slugOrId);
    const { role } = await this.assertCommunityRole(
      community._id,
      actorId,
      systemRole,
      [CommunityRole.OWNER, CommunityRole.MODERATOR],
    );

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    const parentPost = await this.postModel.findById(comment.postId).lean();
    if (
      !parentPost?.communityId ||
      String(parentPost.communityId) !== String(community._id)
    ) {
      throw new ForbiddenException(
        'Moderator chỉ được kiểm duyệt bình luận trong cộng đồng mình quản lý',
      );
    }

    const isHide = dto.action === 'HIDE';
    comment.isHidden = isHide;
    comment.hiddenReason = isHide ? dto.reason.trim() : undefined;
    comment.hiddenById = isHide ? new Types.ObjectId(actorId) : undefined;
    comment.hiddenAt = isHide ? new Date() : undefined;
    await comment.save();

    await this.auditLogModel.create({
      actorId: new Types.ObjectId(actorId),
      actorRole: role,
      scope: 'COMMUNITY',
      communityId: community._id,
      targetType: 'COMMENT',
      targetId: comment._id as Types.ObjectId,
      action: isHide ? 'HIDE_COMMENT' : 'RESTORE_COMMENT',
      reason: dto.reason.trim(),
    });

    return {
      commentId: String(comment._id),
      communityId: String(community._id),
      isHidden: comment.isHidden,
      hiddenReason: comment.hiddenReason || null,
    };
  }
}
