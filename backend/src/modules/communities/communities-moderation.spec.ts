import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { CommunitiesService } from './communities.service';
import { ReportsService } from '../admin/reports.service';
import { AdminService } from '../admin/admin.service';
import { PostsService } from '../posts/posts.service';
import { GearService } from '../gear/gear.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import {
  AccountStatus,
  ActivityType,
  CommunityRole,
  GearModerationStatus,
  GearStatus,
  NotificationType,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from '../../common/enums/system.enums';

function matchesFilter(doc: any, filter: Record<string, any> = {}): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$and' && Array.isArray(cond)) {
      if (!cond.every((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    if (key === '$or' && Array.isArray(cond)) {
      if (!cond.some((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    const val = doc?.[key];
    if (cond instanceof RegExp) {
      if (!cond.test(String(val || ''))) return false;
      continue;
    }
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId) && !(cond instanceof Date)) {
      if ('$in' in cond) {
        const arr = cond.$in.map((x: any) => String(x));
        if (!arr.includes(String(val))) return false;
        continue;
      }
      if ('$nin' in cond) {
        const arr = cond.$nin.map((x: any) => String(x));
        if (arr.includes(String(val))) return false;
        continue;
      }
      if ('$ne' in cond) {
        if (val === cond.$ne) return false;
        continue;
      }
      if ('$regex' in cond) {
        const re = new RegExp(cond.$regex, cond.$options || '');
        if (!re.test(String(val || ''))) return false;
        continue;
      }
    }
    if (String(val) !== String(cond)) return false;
  }
  return true;
}

function makeChain(itemsFn: () => any) {
  const obj: any = {
    sort: jest.fn(() => obj),
    skip: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    select: jest.fn(() => obj),
    lean: jest.fn(async () => itemsFn()),
    exec: jest.fn(async () => itemsFn()),
    then: (resolve: any, reject: any) => Promise.resolve(itemsFn()).then(resolve, reject),
  };
  return obj;
}

function createInMemoryModel(store: Map<string, any>) {
  const model: any = function (docData: any) {
    const _id = docData._id || new Types.ObjectId();
    const record: any = {
      ...docData,
      _id,
      createdAt: docData.createdAt || new Date(),
      updatedAt: docData.updatedAt || new Date(),
      save: jest.fn(async () => {
        record.updatedAt = new Date();
        store.set(String(record._id), record);
        return record;
      }),
      toObject: () => ({ ...record }),
    };
    return record;
  };

  model.find = jest.fn((filter: any = {}) =>
    makeChain(() => Array.from(store.values()).filter((d) => matchesFilter(d, filter))),
  );
  model.findOne = jest.fn((filter: any = {}) =>
    makeChain(() => {
      const found = Array.from(store.values()).find((d) => matchesFilter(d, filter));
      if (!found) return null;
      if (!found.save) {
        found.save = jest.fn(async () => {
          found.updatedAt = new Date();
          store.set(String(found._id), found);
          return found;
        });
      }
      return found;
    }),
  );
  model.findById = jest.fn((id: any) =>
    makeChain(() => {
      const found = store.get(String(id)) || null;
      if (found && !found.save) {
        found.save = jest.fn(async () => {
          found.updatedAt = new Date();
          store.set(String(found._id), found);
          return found;
        });
      }
      return found;
    }),
  );
  model.create = jest.fn(async (docData: any) => {
    const _id = docData._id || new Types.ObjectId();
    const record: any = {
      ...docData,
      _id,
      createdAt: new Date(),
      updatedAt: new Date(),
      save: jest.fn(async () => {
        store.set(String(_id), record);
        return record;
      }),
      toObject: () => ({ ...record }),
    };
    store.set(String(_id), record);
    return record;
  });
  model.countDocuments = jest.fn(async (filter: any = {}) =>
    Array.from(store.values()).filter((d) => matchesFilter(d, filter)).length,
  );
  model.updateOne = jest.fn(async (filter: any, update: any) => {
    const found = Array.from(store.values()).find((d) => matchesFilter(d, filter));
    if (!found) return { modifiedCount: 0 };
    if (update.$set) Object.assign(found, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        found[k] = (found[k] || 0) + Number(v);
      }
    }
    return { modifiedCount: 1 };
  });
  model.findByIdAndUpdate = jest.fn((id: any, update: any) =>
    makeChain(() => {
      const found = store.get(String(id));
      if (!found) return null;
      if (update.$set) Object.assign(found, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          found[k] = (found[k] || 0) + Number(v);
        }
      }
      return found;
    }),
  );
  model.deleteOne = jest.fn(async (filter: any) => {
    const found = Array.from(store.values()).find((d) => matchesFilter(d, filter));
    if (!found) return { deletedCount: 0 };
    store.delete(String(found._id));
    return { deletedCount: 1 };
  });
  return model;
}

describe('Phase 8 – Communities, Admin & Content Moderation Suite', () => {
  const ownerAId = new Types.ObjectId();
  const modAId = new Types.ObjectId();
  const memberId = new Types.ObjectId();
  const outsiderId = new Types.ObjectId();
  const adminId = new Types.ObjectId();

  let communitiesStore: Map<string, any>;
  let membersStore: Map<string, any>;
  let postsStore: Map<string, any>;
  let commentsStore: Map<string, any>;
  let gearStore: Map<string, any>;
  let usersStore: Map<string, any>;
  let profilesStore: Map<string, any>;
  let reportsStore: Map<string, any>;
  let disputesStore: Map<string, any>;
  let bookingsStore: Map<string, any>;
  let auditLogsStore: Map<string, any>;
  let sentNotifications: any[];

  let communitiesService: CommunitiesService;
  let reportsService: ReportsService;
  let adminService: AdminService;
  let postsService: PostsService;
  let gearService: GearService;

  beforeEach(() => {
    communitiesStore = new Map();
    membersStore = new Map();
    postsStore = new Map();
    commentsStore = new Map();
    gearStore = new Map();
    usersStore = new Map();
    profilesStore = new Map();
    reportsStore = new Map();
    disputesStore = new Map();
    bookingsStore = new Map();
    auditLogsStore = new Map();
    sentNotifications = [];

    // Seed users & profiles
    for (const [id, username, role, status] of [
      [ownerAId, 'owner_a', UserRole.USER, AccountStatus.ACTIVE],
      [modAId, 'mod_a', UserRole.USER, AccountStatus.ACTIVE],
      [memberId, 'member_u', UserRole.USER, AccountStatus.ACTIVE],
      [outsiderId, 'outsider_u', UserRole.USER, AccountStatus.ACTIVE],
      [adminId, 'admin_u', UserRole.ADMIN, AccountStatus.ACTIVE],
    ] as const) {
      usersStore.set(String(id), {
        _id: id,
        email: `${username}@travelshare.vn`,
        role,
        status,
      });
      profilesStore.set(String(id), {
        _id: new Types.ObjectId(),
        userId: id,
        username,
        fullName: username.toUpperCase(),
        avatarUrl: '',
        trustScore: 5,
      });
    }

    const communityModel = createInMemoryModel(communitiesStore);
    const memberModel = createInMemoryModel(membersStore);
    const postModel = createInMemoryModel(postsStore);
    const commentModel = createInMemoryModel(commentsStore);
    const gearModel = createInMemoryModel(gearStore);
    const userModel = createInMemoryModel(usersStore);
    const profileModel = createInMemoryModel(profilesStore);
    const reportModel = createInMemoryModel(reportsStore);
    const disputeModel = createInMemoryModel(disputesStore);
    const bookingModel = createInMemoryModel(bookingsStore);
    const auditLogModel = createInMemoryModel(auditLogsStore);

    const mockNotificationsService: any = {
      createIdempotentNotification: jest.fn(async (payload: any) => {
        sentNotifications.push(payload);
        return payload;
      }),
    };

    const emptyModel = createInMemoryModel(new Map());

    postsService = new PostsService(
      postModel,
      commentModel,
      emptyModel,
      emptyModel,
      emptyModel,
      profileModel,
      gearModel,
      communityModel,
      memberModel,
    );

    communitiesService = new CommunitiesService(
      communityModel,
      memberModel,
      profileModel,
      postModel,
      commentModel,
      auditLogModel,
      postsService,
    );

    reportsService = new ReportsService(
      reportModel,
      postModel,
      commentModel,
      gearModel,
      userModel,
      bookingModel,
      memberModel,
      profileModel,
      auditLogModel,
      mockNotificationsService,
    );

    adminService = new AdminService(
      userModel,
      profileModel,
      postModel,
      commentModel,
      gearModel,
      communityModel,
      reportModel,
      disputeModel,
      bookingModel,
      auditLogModel,
      undefined,
      mockNotificationsService,
    );

    gearService = new GearService(
      emptyModel,
      gearModel,
      profileModel,
      bookingModel,
      { isRangeAvailable: jest.fn(async () => true) } as any,
    );
  });

  it('1. Join community idempotently, post inside community, and read on community feed', async () => {
    const group = await communitiesService.createCommunity(String(ownerAId), {
      name: 'Trekking Việt Nam',
      description: 'Cộng đồng leo núi',
      activityType: ActivityType.TREKKING,
      rules: ['Không spam'],
    });

    const firstJoin = await communitiesService.joinCommunity(
      String(memberId),
      group.slug,
    );
    const secondJoin = await communitiesService.joinCommunity(
      String(memberId),
      group.slug,
    );

    expect(firstJoin.role).toBe(CommunityRole.MEMBER);
    expect(secondJoin.membersCount).toBe(firstJoin.membersCount);
    expect(membersStore.size).toBe(2); // owner + 1 member (not duplicated)

    const post = await postsService.createPost(String(memberId), {
      content: 'Review cung Tà Năng - Phan Dũng mùa cỏ cháy',
      communityId: group.id,
    });

    const communityFeed = await communitiesService.getCommunityPosts(
      group.slug,
      { limit: 10 },
      String(memberId),
    );
    expect(communityFeed.items.length).toBe(1);
    expect(communityFeed.items[0].id).toBe(post.id);
    expect(communityFeed.items[0].community?.slug).toBe(group.slug);
  });

  it('2. Rejects non-members from posting and enforces scoped community moderation', async () => {
    const groupA = await communitiesService.createCommunity(String(ownerAId), {
      name: 'Group A',
      description: 'Nhóm A',
      activityType: ActivityType.TREKKING,
    });
    const groupB = await communitiesService.createCommunity(String(outsiderId), {
      name: 'Group B',
      description: 'Nhóm B',
      activityType: ActivityType.CAMPING,
    });

    // Non-member cannot post in Group A
    await expect(
      postsService.createPost(String(outsiderId), {
        content: 'Spam ngoài nhóm',
        communityId: groupA.id,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Owner A assigns modA as MODERATOR of Group A
    await communitiesService.joinCommunity(String(modAId), groupA.slug);
    await communitiesService.assignMemberRole(
      String(ownerAId),
      UserRole.USER,
      groupA.slug,
      String(modAId),
      { role: CommunityRole.MODERATOR },
    );

    // Member posts in Group B
    await communitiesService.joinCommunity(String(memberId), groupB.slug);
    const postB = await postsService.createPost(String(memberId), {
      content: 'Bài viết trong Group B',
      communityId: groupB.id,
    });

    // Mod of Group A CANNOT moderate Group B's post
    await expect(
      communitiesService.moderateCommunityPost(
        String(modAId),
        UserRole.USER,
        groupB.slug,
        postB.id,
        { action: 'HIDE', reason: 'Thử quyền chéo nhóm' },
      ),
    ).rejects.toThrow(ForbiddenException);

    // Owner A cannot leave Group A before transferring ownership
    await expect(
      communitiesService.leaveCommunity(String(ownerAId), groupA.slug),
    ).rejects.toThrow();

    // Transfer ownership to modA, then ownerA can leave
    await communitiesService.transferOwnership(
      String(ownerAId),
      UserRole.USER,
      groupA.slug,
      { newOwnerId: String(modAId) },
    );
    const left = await communitiesService.leaveCommunity(
      String(ownerAId),
      groupA.slug,
    );
    expect(left.joined).toBe(false);
  });

  it('3. Report post -> Admin/Moderator hides -> disappears from feed -> restore -> reporter notified without internalNote leak', async () => {
    const post = await postsService.createPost(String(outsiderId), {
      content: 'Bài viết có dấu hiệu vi phạm',
    });

    const createdReport = await reportsService.createReport(String(memberId), {
      targetType: ReportTargetType.POST,
      targetId: post.id,
      reason: 'Thông tin sai lệch / lừa đảo',
    });
    expect(createdReport.status).toBe(ReportStatus.PENDING);

    const handled = await reportsService.handleReport(
      createdReport.id,
      String(adminId),
      UserRole.ADMIN,
      {
        status: ReportStatus.RESOLVED,
        action: 'HIDE_CONTENT',
        publicOutcome: 'Bài viết đã bị ẩn do vi phạm quy định cộng đồng.',
        internalNote: 'SECRET_INTERNAL_NOTE_ADMIN_ONLY',
      },
    );
    expect(handled.status).toBe(ReportStatus.RESOLVED);

    // Hidden post disappears from public feed and getPostById
    const feedAfterHide = await postsService.getPostsFeed({ limit: 10 });
    expect(feedAfterHide.items.some((p) => p.id === post.id)).toBe(false);
    await expect(postsService.getPostById(post.id)).rejects.toThrow(
      NotFoundException,
    );

    // Reporter notification received & my reports never expose internalNote
    expect(sentNotifications.length).toBe(1);
    expect(sentNotifications[0].type).toBe(NotificationType.REPORT_RESOLVED);
    expect(sentNotifications[0].recipientId).toBe(String(memberId));

    const myReports = await reportsService.listMyReports(
      String(memberId),
      1,
      10,
    );
    expect((myReports.items[0] as any).internalNote).toBeUndefined();

    // Admin restores post
    await adminService.moderateContent(String(adminId), 'POST', post.id, {
      action: 'RESTORE',
      reason: 'Đã chỉnh sửa hợp lệ',
    });
    const restored = await postsService.getPostById(post.id);
    expect(restored.id).toBe(post.id);
  });

  it('4. Admin hides GearItem -> removed from Marketplace search while Booking snapshot stays intact', async () => {
    const gearId = new Types.ObjectId();
    gearStore.set(String(gearId), {
      _id: gearId,
      ownerId: outsiderId,
      categoryCode: 'TENT',
      title: 'Lều 4 người Naturehike',
      description: 'Lều chống nước tốt',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      totalQuantity: 2,
      pricePerDay: 150000,
      depositAmount: 500000,
      city: 'TP.HCM',
      district: 'Quận 1',
      images: [],
      ratingAvg: 5,
      bookingCount: 1,
    });

    const beforeSearch = await gearService.searchGear({ q: 'Naturehike' });
    expect(beforeSearch.items.length).toBe(1);

    await adminService.moderateContent(String(adminId), 'GEAR', String(gearId), {
      action: 'HIDE',
      reason: 'Thiết bị báo hỏng chưa kiểm định',
    });

    const updatedGear = gearStore.get(String(gearId));
    expect(updatedGear.isActive).toBe(false);
    expect(updatedGear.moderationStatus).toBe(GearModerationStatus.REJECTED);

    const afterSearch = await gearService.searchGear({ q: 'Naturehike' });
    expect(afterSearch.items.length).toBe(0);
  });

  it('5. Enforces RolesGuard for /admin and blocks SUSPENDED users in JwtStrategy', async () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    const userContext: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: String(memberId), role: UserRole.USER } }),
      }),
    };
    expect(() => rolesGuard.canActivate(userContext)).toThrow(ForbiddenException);

    // Suspend member and test JwtStrategy.validate
    await adminService.updateUserAccountStatus(
      String(adminId),
      String(memberId),
      {
        status: AccountStatus.SUSPENDED,
        reason: 'Tài khoản vi phạm nhiều lần',
      },
    );

    const userModel = createInMemoryModel(usersStore);
    const configService: any = { get: () => 'test-secret' };
    const jwtStrategy = new JwtStrategy(configService, userModel);

    await expect(
      jwtStrategy.validate({
        sub: String(memberId),
        email: 'member_u@travelshare.vn',
        role: UserRole.USER,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
