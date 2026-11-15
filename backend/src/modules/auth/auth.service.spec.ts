import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Profile, User } from '../../database/schemas';
import { AccountStatus, UserRole } from '../../common/enums/system.enums';

describe('AuthService (Phase 1 Unit Tests)', () => {
  let service: AuthService;
  let mockUserModel: any;
  let mockProfileModel: any;
  let mockJwtService: any;

  beforeEach(async () => {
    mockUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    mockProfileModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt-token'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Profile.name), useValue: mockProfileModel },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'jwt.accessSecret': 'test-access-secret',
                'jwt.refreshSecret': 'test-refresh-secret',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshExpiresIn': '7d',
                nodeEnv: 'test',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should register a new user, hash password, create profile, and issue tokens', async () => {
    mockUserModel.findOne.mockResolvedValue(null);
    mockProfileModel.findOne.mockResolvedValue(null);

    const savedUser = {
      _id: '67361a000000000000000001',
      email: 'trekker@travelshare.vn',
      role: UserRole.USER,
      status: AccountStatus.ACTIVE,
      emailVerified: false,
      refreshSessions: [],
      save: jest.fn().mockResolvedValue(true),
    };
    mockUserModel.create.mockResolvedValue(savedUser);
    mockProfileModel.create.mockResolvedValue({
      username: 'trekker',
      fullName: 'Lê Hoàng Nam',
      avatarUrl: 'https://example.com/avatar.png',
      coverUrl: '',
      bio: 'Bio',
      city: 'Hà Nội, Việt Nam',
      experienceLevel: 'BEGINNER',
      favoriteActivities: ['TREKKING'],
      followersCount: 0,
      followingCount: 0,
      trustScore: 5,
    });

    const result = await service.register({
      email: 'Trekker@TravelShare.vn',
      password: 'Password@123',
      fullName: 'Lê Hoàng Nam',
      username: 'trekker',
    });

    expect(result.user.email).toBe('trekker@travelshare.vn');
    expect(result.user.profile?.username).toBe('trekker');
    expect(result.accessToken).toBe('signed-jwt-token');
    expect(result.refreshToken).toBe('signed-jwt-token');
    expect(savedUser.refreshSessions.length).toBe(1);
    expect(savedUser.save).toHaveBeenCalled();
  });

  it('should reject registration when email already exists', async () => {
    mockUserModel.findOne.mockResolvedValue({ _id: 'existing' });

    await expect(
      service.register({
        email: 'dup@travelshare.vn',
        password: 'Password@123',
        fullName: 'Duplicate User',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject login with wrong password', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass@123', 10);
    mockUserModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'u1',
        email: 'user@travelshare.vn',
        passwordHash,
        status: AccountStatus.ACTIVE,
      }),
    });

    await expect(
      service.login({
        email: 'user@travelshare.vn',
        password: 'WrongPassword@123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should revoke all refresh sessions when a revoked session token is re-presented (token reuse detection)', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      sessionId: 'stolen-or-old-session-id',
      email: 'user@travelshare.vn',
      role: UserRole.USER,
    });

    const userDoc = {
      _id: 'u1',
      status: AccountStatus.ACTIVE,
      refreshSessions: [
        {
          sessionId: 'active-session-id',
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 60000),
        },
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });

    await expect(service.refreshTokens('reused-token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userDoc.refreshSessions).toEqual([]);
    expect(userDoc.save).toHaveBeenCalled();
  });
});
