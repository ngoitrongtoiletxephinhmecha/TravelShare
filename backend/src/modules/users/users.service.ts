import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Follow,
  FollowDocument,
  Post,
  PostDocument,
  Profile,
  ProfileDocument,
  Review,
  ReviewDocument,
  User,
  UserDocument,
} from '../../database/schemas';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    @InjectModel(Follow.name) private followModel: Model<FollowDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @Optional()
    @InjectModel(Review.name)
    private reviewModel?: Model<ReviewDocument>,
  ) {}

  async getProfileByUserId(userId: string): Promise<Record<string, any>> {
    const profile = await this.profileModel
      .findOne({
        userId: new Types.ObjectId(userId),
      })
      .lean();
    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
    }
    const postsCount = await this.postModel.countDocuments({
      authorId: profile.userId,
    });
    return {
      ...profile,
      userId: String(profile.userId),
      postsCount,
      isFollowing: false,
    };
  }

  async getPublicProfile(identifier: string, viewerId?: string) {
    const query = Types.ObjectId.isValid(identifier)
      ? {
          $or: [
            { userId: new Types.ObjectId(identifier) },
            { username: identifier.toLowerCase() },
          ],
        }
      : { username: identifier.toLowerCase() };

    const profile = await this.profileModel.findOne(query).lean();
    if (!profile) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const [postsCount, followEdge] = await Promise.all([
      this.postModel.countDocuments({ authorId: profile.userId }),
      viewerId && Types.ObjectId.isValid(viewerId)
        ? this.followModel.exists({
            followerId: new Types.ObjectId(viewerId),
            followingId: profile.userId,
          })
        : Promise.resolve(null),
    ]);

    return {
      id: String(profile._id),
      userId: String(profile.userId),
      username: profile.username,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      coverUrl: profile.coverUrl,
      bio: profile.bio,
      city: profile.city,
      experienceLevel: profile.experienceLevel,
      favoriteActivities: profile.favoriteActivities || [],
      followersCount: profile.followersCount || 0,
      followingCount: profile.followingCount || 0,
      trustScore: profile.trustScore ?? 5.0,
      completedBookingsCount: profile.completedBookingsCount || 0,
      postsCount,
      isFollowing: Boolean(followEdge),
    };
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Record<string, any>> {
    const profile = await this.profileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set: dto },
        { new: true },
      )
      .lean();
    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ cá nhân');
    }
    return profile as Record<string, any>;
  }

  async followUser(followerId: string, targetUserId: string) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy người dùng cần theo dõi');
    }
    if (String(followerId) === String(targetUserId)) {
      throw new BadRequestException('Bạn không thể tự theo dõi chính mình');
    }

    const followerObjId = new Types.ObjectId(followerId);
    const targetObjId = new Types.ObjectId(targetUserId);

    const targetProfile = await this.profileModel.findOne({
      userId: targetObjId,
    });
    if (!targetProfile) {
      throw new NotFoundException('Không tìm thấy người dùng cần theo dõi');
    }

    const res = await this.followModel.updateOne(
      { followerId: followerObjId, followingId: targetObjId },
      {
        $setOnInsert: {
          followerId: followerObjId,
          followingId: targetObjId,
        },
      },
      { upsert: true },
    );

    if (res.upsertedCount && res.upsertedCount > 0) {
      await Promise.all([
        this.profileModel.updateOne(
          { userId: targetObjId },
          { $inc: { followersCount: 1 } },
        ),
        this.profileModel.updateOne(
          { userId: followerObjId },
          { $inc: { followingCount: 1 } },
        ),
      ]);
    }

    const updatedTarget = await this.profileModel
      .findOne({ userId: targetObjId })
      .select('followersCount')
      .lean();

    return {
      isFollowing: true,
      targetUserId,
      followersCount: updatedTarget?.followersCount ?? 1,
    };
  }

  async unfollowUser(followerId: string, targetUserId: string) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const followerObjId = new Types.ObjectId(followerId);
    const targetObjId = new Types.ObjectId(targetUserId);

    const deleted = await this.followModel.deleteOne({
      followerId: followerObjId,
      followingId: targetObjId,
    });

    if (deleted.deletedCount && deleted.deletedCount > 0) {
      await Promise.all([
        this.profileModel.updateOne(
          { userId: targetObjId, followersCount: { $gt: 0 } },
          { $inc: { followersCount: -1 } },
        ),
        this.profileModel.updateOne(
          { userId: followerObjId, followingCount: { $gt: 0 } },
          { $inc: { followingCount: -1 } },
        ),
      ]);
    }

    const updatedTarget = await this.profileModel
      .findOne({ userId: targetObjId })
      .select('followersCount')
      .lean();

    return {
      isFollowing: false,
      targetUserId,
      followersCount: Math.max(0, updatedTarget?.followersCount ?? 0),
    };
  }

  async getFollowers(targetUserId: string, viewerId?: string) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const edges = await this.followModel
      .find({ followingId: new Types.ObjectId(targetUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const followerIds = edges.map((e) => e.followerId);
    return this.hydrateUserConnectionList(followerIds, viewerId);
  }

  async getFollowing(targetUserId: string, viewerId?: string) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const edges = await this.followModel
      .find({ followerId: new Types.ObjectId(targetUserId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const followingIds = edges.map((e) => e.followingId);
    return this.hydrateUserConnectionList(followingIds, viewerId);
  }

  async getSuggestedUsers(viewerId?: string) {
    const excludeIds: Types.ObjectId[] = [];
    if (viewerId && Types.ObjectId.isValid(viewerId)) {
      const viewerObjId = new Types.ObjectId(viewerId);
      excludeIds.push(viewerObjId);
      const followingEdges = await this.followModel
        .find({ followerId: viewerObjId })
        .select('followingId')
        .lean();
      for (const edge of followingEdges) {
        excludeIds.push(edge.followingId);
      }
    }

    const profiles = await this.profileModel
      .find(
        excludeIds.length > 0 ? { userId: { $nin: excludeIds } } : {},
      )
      .sort({ followersCount: -1, trustScore: -1 })
      .limit(6)
      .lean();

    return profiles.map((p) => ({
      userId: String(p.userId),
      username: p.username,
      fullName: p.fullName,
      avatarUrl: p.avatarUrl,
      city: p.city,
      bio: p.bio,
      experienceLevel: p.experienceLevel,
      followersCount: p.followersCount || 0,
      trustScore: p.trustScore ?? 5.0,
      isFollowing: false,
    }));
  }

  async getUserReviews(identifier: string): Promise<Record<string, any>> {
    const query = Types.ObjectId.isValid(identifier)
      ? {
          $or: [
            { userId: new Types.ObjectId(identifier) },
            { username: identifier.toLowerCase() },
          ],
        }
      : { username: identifier.toLowerCase() };

    const profile = await this.profileModel.findOne(query).lean();
    if (!profile) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!this.reviewModel) {
      return {
        targetUserId: String(profile.userId),
        ratingAvg: profile.trustScore ?? 5.0,
        ratingCount: 0,
        items: [],
      };
    }

    const reviews = await this.reviewModel
      .find({ targetUserId: profile.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const reviewerIds = Array.from(
      new Set(reviews.map((r: any) => String(r.reviewerId))),
    ).map((id) => new Types.ObjectId(id));

    const reviewerProfiles =
      reviewerIds.length > 0
        ? await this.profileModel
            .find({ userId: { $in: reviewerIds } })
            .lean()
        : [];
    const profileMap = new Map(
      reviewerProfiles.map((p: any) => [String(p.userId), p]),
    );

    const ratingCount = reviews.length;
    const ratingAvg =
      ratingCount > 0
        ? Math.round(
            (reviews.reduce((sum, r: any) => sum + Number(r.rating), 0) /
              ratingCount) *
              10,
          ) / 10
        : (profile.trustScore ?? 5.0);

    return {
      targetUserId: String(profile.userId),
      ratingAvg,
      ratingCount,
      items: reviews.map((r: any) => {
        const revProf = profileMap.get(String(r.reviewerId));
        return {
          id: String(r._id),
          bookingId: String(r.bookingId),
          gearId: String(r.gearId),
          reviewerRole: r.reviewerRole || 'RENTER',
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          reviewer: {
            userId: String(r.reviewerId),
            username: revProf?.username || 'member',
            fullName: revProf?.fullName || 'Thành viên TravelShare',
            avatarUrl: revProf?.avatarUrl || '',
          },
        };
      }),
    };
  }

  private async hydrateUserConnectionList(
    userIds: Types.ObjectId[],
    viewerId?: string,
  ) {
    if (userIds.length === 0) return [];

    const [profiles, viewerFollowing] = await Promise.all([
      this.profileModel.find({ userId: { $in: userIds } }).lean(),
      viewerId && Types.ObjectId.isValid(viewerId)
        ? this.followModel
            .find({
              followerId: new Types.ObjectId(viewerId),
              followingId: { $in: userIds },
            })
            .select('followingId')
            .lean()
        : Promise.resolve([]),
    ]);

    const followingSet = new Set(
      viewerFollowing.map((f) => String(f.followingId)),
    );
    const profileMap = new Map(
      profiles.map((p) => [String(p.userId), p]),
    );

    return userIds
      .map((id) => profileMap.get(String(id)))
      .filter(Boolean)
      .map((p: any) => ({
        userId: String(p.userId),
        username: p.username,
        fullName: p.fullName,
        avatarUrl: p.avatarUrl,
        city: p.city,
        bio: p.bio,
        trustScore: p.trustScore ?? 5.0,
        followersCount: p.followersCount || 0,
        isFollowing: followingSet.has(String(p.userId)),
      }));
  }
}
