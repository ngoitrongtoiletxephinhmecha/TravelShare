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
  Follow,
  FollowDocument,
  GearItem,
  GearItemDocument,
  Post,
  PostDocument,
  Profile,
  ProfileDocument,
  Reaction,
  ReactionDocument,
  SavedPost,
  SavedPostDocument,
} from '../../database/schemas';
import {
  CreateCommentDto,
  CreatePostDto,
  QueryPostsDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './dto/post.dto';
import {
  ActivityType,
  CommunityRole,
  normalizeLegacyActivity,
  ReactionType,
  UserRole,
} from '../../common/enums/system.enums';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Reaction.name) private reactionModel: Model<ReactionDocument>,
    @InjectModel(SavedPost.name)
    private savedPostModel: Model<SavedPostDocument>,
    @InjectModel(Follow.name) private followModel: Model<FollowDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    @InjectModel(GearItem.name) private gearModel: Model<GearItemDocument>,
    @Optional()
    @InjectModel(Community.name)
    private communityModel?: Model<CommunityDocument>,
    @Optional()
    @InjectModel(CommunityMember.name)
    private communityMemberModel?: Model<CommunityMemberDocument>,
  ) {}

  async createPost(userId: string, dto: CreatePostDto) {
    this.validateNoBase64Media(dto.mediaUrls);

    let communityObjId: Types.ObjectId | undefined;
    if (dto.communityId) {
      if (!Types.ObjectId.isValid(dto.communityId)) {
        throw new BadRequestException('Mã cộng đồng (communityId) không hợp lệ');
      }
      communityObjId = new Types.ObjectId(dto.communityId);
      if (this.communityModel) {
        const community = await this.communityModel
          .findById(communityObjId)
          .lean();
        if (!community || community.isActive === false) {
          throw new NotFoundException('Không tìm thấy cộng đồng');
        }
      }
      if (this.communityMemberModel) {
        const membership = await this.communityMemberModel
          .findOne({
            communityId: communityObjId,
            userId: new Types.ObjectId(userId),
          })
          .lean();
        if (!membership) {
          throw new ForbiddenException(
            'Bạn cần tham gia cộng đồng trước khi đăng bài vào nhóm này',
          );
        }
      }
    }

    const hashtags = this.extractAndNormalizeHashtags(
      dto.content,
      dto.hashtags,
    );

    const gearTagIds = (dto.gearTags || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const post = await this.postModel.create({
      authorId: new Types.ObjectId(userId),
      ...(communityObjId ? { communityId: communityObjId } : {}),
      content: dto.content.trim(),
      mediaUrls: dto.mediaUrls || [],
      hashtags,
      locationName: dto.locationName?.trim() || undefined,
      activityType: dto.activityType,
      gearTags: gearTagIds,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      isFeatured: false,
      isDemo: false,
      isHidden: false,
    });

    const [enriched] = await this.enrichPosts([post.toObject()], userId);
    return enriched;
  }

  async updatePost(
    userId: string,
    userRole: string,
    postId: string,
    dto: UpdatePostDto,
  ) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const isOwner = String(post.authorId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa bài viết không thuộc sở hữu của mình',
      );
    }

    if (dto.mediaUrls) {
      this.validateNoBase64Media(dto.mediaUrls);
      post.mediaUrls = dto.mediaUrls;
    }

    if (dto.content !== undefined) {
      post.content = dto.content.trim();
    }

    if (dto.content !== undefined || dto.hashtags !== undefined) {
      post.hashtags = this.extractAndNormalizeHashtags(
        post.content,
        dto.hashtags ?? post.hashtags,
      );
    }

    if (dto.locationName !== undefined) {
      post.locationName = dto.locationName.trim() || undefined;
    }

    if (dto.activityType !== undefined) {
      post.activityType = dto.activityType;
    }

    if (dto.gearTags !== undefined) {
      post.gearTags = dto.gearTags
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
    }

    await post.save();
    const [enriched] = await this.enrichPosts([post.toObject()], userId);
    return enriched;
  }

  async deletePost(userId: string, userRole: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const isOwner = String(post.authorId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền xóa bài viết không thuộc sở hữu của mình',
      );
    }

    await Promise.all([
      this.postModel.deleteOne({ _id: post._id }),
      this.commentModel.deleteMany({ postId: post._id }),
      this.reactionModel.deleteMany({ postId: post._id }),
      this.savedPostModel.deleteMany({ postId: post._id }),
    ]);

    return { deleted: true, postId };
  }

  async getPostById(postId: string, viewerId?: string, viewerRole?: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const post = await this.postModel.findById(postId).lean();
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    if (post.isHidden) {
      let canViewHidden = viewerRole === UserRole.ADMIN;
      if (
        !canViewHidden &&
        viewerId &&
        post.communityId &&
        this.communityMemberModel
      ) {
        const membership = await this.communityMemberModel
          .findOne({
            communityId: post.communityId,
            userId: new Types.ObjectId(viewerId),
          })
          .lean();
        if (
          membership &&
          (membership.role === CommunityRole.OWNER ||
            membership.role === CommunityRole.MODERATOR)
        ) {
          canViewHidden = true;
        }
      }
      if (!canViewHidden) {
        throw new NotFoundException('Bài viết không tồn tại hoặc đã bị ẩn');
      }
    }

    const [enriched] = await this.enrichPosts([post], viewerId);
    return enriched;
  }

  async getPostsFeed(query: QueryPostsDto, viewerId?: string) {
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 30);
    const filter: FilterQuery<PostDocument> = {};
    const andConditions: FilterQuery<PostDocument>[] = [
      { isHidden: { $ne: true } },
    ];

    if (query.communityId) {
      if (!Types.ObjectId.isValid(query.communityId)) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      andConditions.push({ communityId: new Types.ObjectId(query.communityId) });
    }

    // 1. Feed Type Filter
    if (query.feedType === 'following') {
      if (!viewerId) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      const follows = await this.followModel
        .find({ followerId: new Types.ObjectId(viewerId) })
        .select('followingId')
        .lean();
      const followingIds = follows.map((f) => f.followingId);
      if (followingIds.length === 0) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      andConditions.push({ authorId: { $in: followingIds } });
    } else if (query.feedType === 'featured') {
      andConditions.push({
        $or: [{ isFeatured: true }, { likesCount: { $gte: 1 } }],
      });
    } else if (query.feedType === 'saved') {
      if (!viewerId) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      const saved = await this.savedPostModel
        .find({ userId: new Types.ObjectId(viewerId) })
        .select('postId')
        .lean();
      const savedIds = saved.map((s) => s.postId);
      if (savedIds.length === 0) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      andConditions.push({ _id: { $in: savedIds } });
    }

    // 2. Author Filter (by ObjectId or username)
    if (query.authorId) {
      if (Types.ObjectId.isValid(query.authorId)) {
        andConditions.push({ authorId: new Types.ObjectId(query.authorId) });
      } else {
        const profile = await this.profileModel
          .findOne({ username: query.authorId.toLowerCase() })
          .lean();
        if (!profile) {
          return { items: [], nextCursor: null, hasMore: false };
        }
        andConditions.push({ authorId: profile.userId });
      }
    }

    // 3. Hashtag Filter
    if (query.hashtag) {
      const cleanTag = query.hashtag.startsWith('#')
        ? query.hashtag.toLowerCase()
        : `#${query.hashtag.toLowerCase()}`;
      andConditions.push({ hashtags: cleanTag });
    }

    // 4. Activity Type Filter
    if (query.activityType) {
      andConditions.push(
        query.activityType === ActivityType.CAMPING
          ? { activityType: { $in: [ActivityType.CAMPING, 'BEACH_CAMPING'] } }
          : { activityType: query.activityType },
      );
    }

    // 5. Keyword Search Filter
    if (query.q && query.q.trim()) {
      const escaped = query.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      andConditions.push({
        $or: [
          { content: regex },
          { locationName: regex },
          { hashtags: regex },
        ],
      });
    }

    // 6. Cursor Pagination (deterministic createdAt + _id descending)
    if (query.cursor) {
      const parsed = this.parseCursor(query.cursor);
      if (parsed) {
        andConditions.push({
          $or: [
            { createdAt: { $lt: parsed.createdAt } },
            {
              createdAt: parsed.createdAt,
              _id: { $lt: parsed.id },
            },
          ],
        });
      }
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const rawPosts = await this.postModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rawPosts.length > limit;
    const sliced = hasMore ? rawPosts.slice(0, limit) : rawPosts;

    let nextCursor: string | null = null;
    if (hasMore && sliced.length > 0) {
      const lastItem = sliced[sliced.length - 1] as any;
      nextCursor = this.encodeCursor(lastItem.createdAt, lastItem._id);
    }

    const items = await this.enrichPosts(sliced, viewerId);

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async likePost(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    const postObjId = new Types.ObjectId(postId);
    const userObjId = new Types.ObjectId(userId);

    const postExists = await this.postModel.exists({ _id: postObjId });
    if (!postExists) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const result = await this.reactionModel.updateOne(
      { postId: postObjId, userId: userObjId },
      {
        $setOnInsert: {
          postId: postObjId,
          userId: userObjId,
          type: ReactionType.LIKE,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount && result.upsertedCount > 0) {
      await this.postModel.updateOne(
        { _id: postObjId },
        { $inc: { likesCount: 1 } },
      );
    }

    const updatedPost = await this.postModel
      .findById(postObjId)
      .select('likesCount')
      .lean();

    return {
      liked: true,
      likesCount: updatedPost?.likesCount ?? 1,
    };
  }

  async unlikePost(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    const postObjId = new Types.ObjectId(postId);
    const userObjId = new Types.ObjectId(userId);

    const deleted = await this.reactionModel.deleteOne({
      postId: postObjId,
      userId: userObjId,
    });

    if (deleted.deletedCount && deleted.deletedCount > 0) {
      await this.postModel.updateOne(
        { _id: postObjId, likesCount: { $gt: 0 } },
        { $inc: { likesCount: -1 } },
      );
    }

    const updatedPost = await this.postModel
      .findById(postObjId)
      .select('likesCount')
      .lean();

    return {
      liked: false,
      likesCount: Math.max(0, updatedPost?.likesCount ?? 0),
    };
  }

  async savePost(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    const postObjId = new Types.ObjectId(postId);
    const userObjId = new Types.ObjectId(userId);

    const postExists = await this.postModel.exists({ _id: postObjId });
    if (!postExists) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    await this.savedPostModel.updateOne(
      { userId: userObjId, postId: postObjId },
      { $setOnInsert: { userId: userObjId, postId: postObjId } },
      { upsert: true },
    );

    return { saved: true, postId };
  }

  async unsavePost(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    const postObjId = new Types.ObjectId(postId);
    const userObjId = new Types.ObjectId(userId);

    await this.savedPostModel.deleteOne({
      userId: userObjId,
      postId: postObjId,
    });

    return { saved: false, postId };
  }

  async getPostComments(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const comments = await this.commentModel
      .find({ postId: new Types.ObjectId(postId), isHidden: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();

    if (comments.length === 0) return [];

    const authorIds = Array.from(
      new Set(comments.map((c) => String(c.authorId))),
    ).map((id) => new Types.ObjectId(id));

    const profiles = await this.profileModel
      .find({ userId: { $in: authorIds } })
      .lean();
    const profileMap = new Map(
      profiles.map((p) => [String(p.userId), p]),
    );

    return comments.map((c: any) => {
      const profile = profileMap.get(String(c.authorId));
      return {
        id: String(c._id),
        postId: String(c.postId),
        authorId: String(c.authorId),
        parentCommentId: c.parentCommentId ? String(c.parentCommentId) : null,
        content: c.content,
        isEdited: Boolean(c.isEdited),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: {
          userId: String(c.authorId),
          username: profile?.username || 'member',
          fullName: profile?.fullName || 'Thành viên TravelShare',
          avatarUrl: profile?.avatarUrl || '',
          trustScore: profile?.trustScore ?? 5.0,
        },
      };
    });
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    const postObjId = new Types.ObjectId(postId);
    const postExists = await this.postModel.exists({ _id: postObjId });
    if (!postExists) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    let parentCommentObjId: Types.ObjectId | null = null;
    if (dto.parentCommentId) {
      if (!Types.ObjectId.isValid(dto.parentCommentId)) {
        throw new BadRequestException('parentCommentId không hợp lệ');
      }
      const parent = await this.commentModel
        .findOne({
          _id: new Types.ObjectId(dto.parentCommentId),
          postId: postObjId,
        })
        .lean();
      if (!parent) {
        throw new NotFoundException('Không tìm thấy bình luận gốc để phản hồi');
      }
      parentCommentObjId = new Types.ObjectId(dto.parentCommentId);
    }

    const comment = await this.commentModel.create({
      postId: postObjId,
      authorId: new Types.ObjectId(userId),
      parentCommentId: parentCommentObjId,
      content: dto.content.trim(),
      isEdited: false,
    });

    await this.postModel.updateOne(
      { _id: postObjId },
      { $inc: { commentsCount: 1 } },
    );

    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    const raw = comment.toObject() as any;
    return {
      id: String(raw._id),
      postId: String(raw.postId),
      authorId: String(raw.authorId),
      parentCommentId: raw.parentCommentId ? String(raw.parentCommentId) : null,
      content: raw.content,
      isEdited: Boolean(raw.isEdited),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      author: {
        userId: String(raw.authorId),
        username: profile?.username || 'member',
        fullName: profile?.fullName || 'Thành viên TravelShare',
        avatarUrl: profile?.avatarUrl || '',
        trustScore: profile?.trustScore ?? 5.0,
      },
    };
  }

  async updateComment(
    userId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    if (String(comment.authorId) !== String(userId)) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa bình luận của người khác',
      );
    }

    comment.content = dto.content.trim();
    comment.isEdited = true;
    await comment.save();

    const profile = await this.profileModel
      .findOne({ userId: comment.authorId })
      .lean();

    const raw = comment.toObject() as any;
    return {
      id: String(raw._id),
      postId: String(raw.postId),
      authorId: String(raw.authorId),
      parentCommentId: raw.parentCommentId ? String(raw.parentCommentId) : null,
      content: raw.content,
      isEdited: true,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      author: {
        userId: String(raw.authorId),
        username: profile?.username || 'member',
        fullName: profile?.fullName || 'Thành viên TravelShare',
        avatarUrl: profile?.avatarUrl || '',
        trustScore: profile?.trustScore ?? 5.0,
      },
    };
  }

  async deleteComment(userId: string, userRole: string, commentId: string) {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Không tìm thấy bình luận');
    }

    const post = await this.postModel.findById(comment.postId).lean();
    const isCommentOwner = String(comment.authorId) === String(userId);
    const isPostOwner = post && String(post.authorId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isCommentOwner && !isPostOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền xóa bình luận này',
      );
    }

    const deleteResult = await this.commentModel.deleteMany({
      $or: [{ _id: comment._id }, { parentCommentId: comment._id }],
    });

    const deletedCount = deleteResult.deletedCount || 1;
    await this.postModel.updateOne(
      { _id: comment.postId },
      { $inc: { commentsCount: -deletedCount } },
    );
    await this.postModel.updateOne(
      { _id: comment.postId, commentsCount: { $lt: 0 } },
      { $set: { commentsCount: 0 } },
    );

    return {
      deleted: true,
      commentId,
      deletedCount,
    };
  }

  async getTrendingHashtags() {
    const agg = await this.postModel.aggregate([
      { $match: { isHidden: { $ne: true } } },
      { $unwind: '$hashtags' },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
    ]);

    return agg.map((item) => ({
      tag: item._id,
      postsCount: item.count,
    }));
  }

  private async enrichPosts(rawPosts: any[], viewerId?: string) {
    if (rawPosts.length === 0) return [];

    const postIds = rawPosts.map((p) => new Types.ObjectId(String(p._id)));
    const authorIds = Array.from(
      new Set(rawPosts.map((p) => String(p.authorId))),
    ).map((id) => new Types.ObjectId(id));

    const allGearIds = Array.from(
      new Set(
        rawPosts.flatMap((p) =>
          (p.gearTags || []).map((id: any) => String(id)),
        ),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const allCommunityIds = Array.from(
      new Set(
        rawPosts
          .filter((p) => p.communityId)
          .map((p) => String(p.communityId)),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const [profiles, gearItems, communities, likedReactions, savedPosts] =
      await Promise.all([
        this.profileModel.find({ userId: { $in: authorIds } }).lean(),
        allGearIds.length > 0
          ? this.gearModel
              .find({ _id: { $in: allGearIds } })
              .select('title dailyPriceVnd categoryCode city district isDemo isActive moderationStatus')
              .lean()
          : Promise.resolve([]),
        allCommunityIds.length > 0 && this.communityModel
          ? this.communityModel
              .find({ _id: { $in: allCommunityIds } })
              .select('slug name avatarUrl')
              .lean()
          : Promise.resolve([]),
        viewerId && Types.ObjectId.isValid(viewerId)
          ? this.reactionModel
              .find({
                postId: { $in: postIds },
                userId: new Types.ObjectId(viewerId),
              })
              .select('postId')
              .lean()
          : Promise.resolve([]),
        viewerId && Types.ObjectId.isValid(viewerId)
          ? this.savedPostModel
              .find({
                postId: { $in: postIds },
                userId: new Types.ObjectId(viewerId),
              })
              .select('postId')
              .lean()
          : Promise.resolve([]),
      ]);

    const profileMap = new Map(
      profiles.map((prof) => [String(prof.userId), prof]),
    );
    const gearMap = new Map<string, any>(
      gearItems.map((g: any) => [String(g._id), g] as [string, any]),
    );
    const communityMap = new Map<string, any>(
      (communities as any[]).map((c: any) => [String(c._id), c] as [string, any]),
    );
    const likedSet = new Set(likedReactions.map((r) => String(r.postId)));
    const savedSet = new Set(savedPosts.map((s) => String(s.postId)));

    return rawPosts.map((p) => {
      const prof = profileMap.get(String(p.authorId));
      const comm = p.communityId
        ? communityMap.get(String(p.communityId))
        : null;
      const postGear = (p.gearTags || [])
        .map((gid: any) => gearMap.get(String(gid)))
        .filter(Boolean)
        .map((g: any) => ({
          id: String(g._id),
          title: g.title,
          dailyPriceVnd: g.dailyPriceVnd,
          categoryCode: g.categoryCode,
          location: `${g.district}, ${g.city}`,
          isDemo: Boolean(g.isDemo),
        }));

      return {
        id: String(p._id),
        authorId: String(p.authorId),
        communityId: p.communityId ? String(p.communityId) : null,
        community: comm
          ? {
              id: String(comm._id),
              slug: comm.slug,
              name: comm.name,
              avatarUrl: comm.avatarUrl || '',
            }
          : null,
        author: {
          userId: String(p.authorId),
          username: prof?.username || 'member',
          fullName: prof?.fullName || 'Thành viên TravelShare',
          avatarUrl: prof?.avatarUrl || '',
          city: prof?.city || 'Việt Nam',
          trustScore: prof?.trustScore ?? 5.0,
        },
        content: p.content,
        mediaUrls: p.mediaUrls || [],
        hashtags: p.hashtags || [],
        locationName: p.locationName || null,
        activityType:
          normalizeLegacyActivity(p.activityType).activity || null,
        gearTags: postGear,
        likesCount: p.likesCount || 0,
        commentsCount: p.commentsCount || 0,
        sharesCount: p.sharesCount || 0,
        isLiked: likedSet.has(String(p._id)),
        isSaved: savedSet.has(String(p._id)),
        isFeatured: Boolean(p.isFeatured),
        isDemo: Boolean(p.isDemo),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
  }

  private extractAndNormalizeHashtags(
    content: string,
    explicitTags?: string[],
  ): string[] {
    const regexMatches = content.match(/#[\p{L}\p{N}_]+/gu) || [];
    const combined = [...regexMatches, ...(explicitTags || [])];
    const normalized = combined
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}`));
    return Array.from(new Set(normalized)).slice(0, 15);
  }

  private validateNoBase64Media(urls?: string[]) {
    if (!urls || urls.length === 0) return;
    for (const url of urls) {
      if (url.trim().startsWith('data:')) {
        throw new BadRequestException(
          'Không cho phép lưu chuỗi base64 trực tiếp vào MongoDB document. Vui lòng upload qua /api/v1/media/upload.',
        );
      }
    }
  }

  private encodeCursor(createdAt: Date | string, id: Types.ObjectId | string) {
    const iso =
      createdAt instanceof Date
        ? createdAt.toISOString()
        : new Date(createdAt).toISOString();
    return `${iso}_${String(id)}`;
  }

  private parseCursor(
    cursor: string,
  ): { createdAt: Date; id: Types.ObjectId } | null {
    const parts = cursor.split('_');
    if (parts.length !== 2) return null;
    const [iso, rawId] = parts;
    const date = new Date(iso);
    if (isNaN(date.getTime()) || !Types.ObjectId.isValid(rawId)) {
      return null;
    }
    return {
      createdAt: date,
      id: new Types.ObjectId(rawId),
    };
  }
}
