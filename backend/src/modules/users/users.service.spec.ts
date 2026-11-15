import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { Follow, Post, Profile, User } from '../../database/schemas';

describe('UsersService (Phase 2 Follow & Profile Tests)', () => {
  let service: UsersService;
  let mockProfileModel: any;
  let mockFollowModel: any;
  let mockPostModel: any;

  const userA = new Types.ObjectId().toHexString();
  const userB = new Types.ObjectId().toHexString();

  beforeEach(async () => {
    mockProfileModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn(),
    };
    mockFollowModel = {
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      exists: jest.fn(),
      find: jest.fn(),
    };
    mockPostModel = {
      countDocuments: jest.fn().mockResolvedValue(4),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Profile.name), useValue: mockProfileModel },
        { provide: getModelToken(Follow.name), useValue: mockFollowModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('prevents a user from following themselves', async () => {
    await expect(service.followUser(userA, userA)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('prevents duplicate follow counter increments when already following', async () => {
    mockProfileModel.findOne
      .mockResolvedValueOnce({ userId: new Types.ObjectId(userB) })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ followersCount: 10 }),
        }),
      });

    mockFollowModel.updateOne.mockResolvedValue({ upsertedCount: 0 });

    const res = await service.followUser(userA, userB);
    expect(res.isFollowing).toBe(true);
    expect(res.followersCount).toBe(10);
    expect(mockProfileModel.updateOne).not.toHaveBeenCalled();
  });
});
