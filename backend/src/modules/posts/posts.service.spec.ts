import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PostsService } from './posts.service';
import {
  Comment,
  Follow,
  GearItem,
  Post,
  Profile,
  Reaction,
  SavedPost,
} from '../../database/schemas';
import { ActivityType, UserRole } from '../../common/enums/system.enums';

describe('PostsService (Phase 2 Social Network Core Tests)', () => {
  let service: PostsService;
  let mockPostModel: any;
  let mockCommentModel: any;
  let mockReactionModel: any;
  let mockSavedPostModel: any;
  let mockFollowModel: any;
  let mockProfileModel: any;
  let mockGearModel: any;

  const ownerId = new Types.ObjectId().toHexString();
  const otherUserId = new Types.ObjectId().toHexString();
  const samplePostId = new Types.ObjectId().toHexString();

  beforeEach(async () => {
    mockPostModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      exists: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      aggregate: jest.fn(),
    };
    mockCommentModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      deleteMany: jest.fn(),
    };
    mockReactionModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    };
    mockSavedPostModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    };
    mockFollowModel = {
      find: jest.fn(),
    };
    mockProfileModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            userId: new Types.ObjectId(ownerId),
            username: 'owner_user',
            fullName: 'Chủ Bài Viết',
            avatarUrl: '',
            trustScore: 4.9,
          },
        ]),
      }),
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          userId: new Types.ObjectId(ownerId),
          username: 'owner_user',
          fullName: 'Chủ Bài Viết',
          avatarUrl: '',
          trustScore: 4.9,
        }),
      }),
    };
    mockGearModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: getModelToken(Comment.name), useValue: mockCommentModel },
        { provide: getModelToken(Reaction.name), useValue: mockReactionModel },
        {
          provide: getModelToken(SavedPost.name),
          useValue: mockSavedPostModel,
        },
        { provide: getModelToken(Follow.name), useValue: mockFollowModel },
        { provide: getModelToken(Profile.name), useValue: mockProfileModel },
        { provide: getModelToken(GearItem.name), useValue: mockGearModel },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('creates a post, extracts hashtags automatically, and enriches author profile', async () => {
    const rawCreated = {
      _id: new Types.ObjectId(samplePostId),
      authorId: new Types.ObjectId(ownerId),
      content: 'Hành trình săn mây #LaoThan và #TrekkingVietNam tuyệt vời',
      mediaUrls: ['http://localhost:4000/uploads/photo1.jpg'],
      hashtags: ['#laothan', '#trekkingvietnam'],
      locationName: 'Y Tý, Lào Cai',
      activityType: ActivityType.TREKKING,
      gearTags: [],
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPostModel.create.mockResolvedValue({
      toObject: () => rawCreated,
    });

    const result = await service.createPost(ownerId, {
      content: rawCreated.content,
      mediaUrls: rawCreated.mediaUrls,
      locationName: rawCreated.locationName,
      activityType: ActivityType.TREKKING,
    });

    expect(result.id).toBe(samplePostId);
    expect(result.hashtags).toEqual(['#laothan', '#trekkingvietnam']);
    expect(result.author.username).toBe('owner_user');
  });

  it('rejects base64 data URI in mediaUrls when creating a post', async () => {
    await expect(
      service.createPost(ownerId, {
        content: 'Bài viết test base64',
        mediaUrls: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('forbids another user from editing a post they do not own', async () => {
    mockPostModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(samplePostId),
      authorId: new Types.ObjectId(ownerId),
      content: 'Bài gốc',
    });

    await expect(
      service.updatePost(otherUserId, UserRole.USER, samplePostId, {
        content: 'Cố tình sửa bài người khác',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows owner to edit their post', async () => {
    const postDoc = {
      _id: new Types.ObjectId(samplePostId),
      authorId: new Types.ObjectId(ownerId),
      content: 'Bài gốc',
      hashtags: [],
      mediaUrls: [],
      gearTags: [],
      save: jest.fn().mockResolvedValue(true),
      toObject: function () {
        return this;
      },
    };
    mockPostModel.findById.mockResolvedValue(postDoc);

    const updated = await service.updatePost(
      ownerId,
      UserRole.USER,
      samplePostId,
      {
        content: 'Nội dung đã cập nhật #YenTu',
      },
    );

    expect(postDoc.save).toHaveBeenCalled();
    expect(updated.content).toBe('Nội dung đã cập nhật #YenTu');
    expect(updated.hashtags).toContain('#yentu');
  });

  it('prevents duplicate like increments when user likes the same post twice', async () => {
    mockPostModel.exists.mockResolvedValue(true);
    mockReactionModel.updateOne.mockResolvedValue({ upsertedCount: 0 });
    mockPostModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ likesCount: 5 }),
      }),
    });

    const res = await service.likePost(ownerId, samplePostId);

    expect(res.liked).toBe(true);
    expect(res.likesCount).toBe(5);
    expect(mockPostModel.updateOne).not.toHaveBeenCalled();
  });

  it('creates a reply comment and forbids non-owner from editing comment', async () => {
    const commentId = new Types.ObjectId().toHexString();
    mockCommentModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(commentId),
      postId: new Types.ObjectId(samplePostId),
      authorId: new Types.ObjectId(ownerId),
      content: 'Bình luận gốc',
    });

    await expect(
      service.updateComment(otherUserId, commentId, {
        content: 'Sửa bình luận người khác',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
