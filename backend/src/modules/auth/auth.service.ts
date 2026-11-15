import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  Profile,
  ProfileDocument,
  User,
  UserDocument,
} from '../../database/schemas';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  AccountStatus,
  ExperienceLevel,
  UserRole,
} from '../../common/enums/system.enums';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();
    const existingEmail = await this.userModel.findOne({ email });
    if (existingEmail) {
      throw new ConflictException('Email này đã được đăng ký trên TravelShare');
    }

    const baseUsername = (
      dto.username ||
      email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 24)
    ).toLowerCase();

    let finalUsername = baseUsername;
    const existingUsername = await this.profileModel.findOne({
      username: finalUsername,
    });
    if (existingUsername) {
      if (dto.username) {
        throw new ConflictException('Username này đã có người sử dụng');
      }
      finalUsername = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.userModel.create({
      email,
      passwordHash,
      role: UserRole.USER,
      status: AccountStatus.ACTIVE,
      emailVerified: false,
      refreshSessions: [],
      lastLoginAt: new Date(),
    });

    const profile = await this.profileModel.create({
      userId: user._id as Types.ObjectId,
      username: finalUsername,
      fullName: dto.fullName.trim(),
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(dto.fullName.trim())}&background=166534&color=fff`,
      bio: 'Thành viên mới của cộng đồng du lịch & chia sẻ đồ phượt TravelShare.',
      city: 'Hà Nội, Việt Nam',
      experienceLevel: ExperienceLevel.BEGINNER,
      favoriteActivities: ['TREKKING', 'CAMPING'],
    });

    const tokens = await this.issueSessionTokens(user, userAgent);

    return {
      user: this.sanitizeUserResponse(user, profile),
      ...tokens,
    };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash +refreshSessions');

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tài khoản hiện đang ở trạng thái ${user.status}. Vui lòng liên hệ quản trị viên.`,
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    user.lastLoginAt = new Date();
    const profile = await this.profileModel.findOne({ userId: user._id });
    const tokens = await this.issueSessionTokens(user, userAgent);

    return {
      user: this.sanitizeUserResponse(user, profile),
      ...tokens,
    };
  }

  async refreshTokens(rawRefreshToken: string, userAgent?: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Không tìm thấy refresh token');
    }

    let payload: { sub: string; sessionId: string; email: string; role: string };
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.userModel
      .findById(payload.sub)
      .select('+refreshSessions');

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không khả dụng');
    }

    const sessionIndex = user.refreshSessions.findIndex(
      (s) => s.sessionId === payload.sessionId,
    );

    if (sessionIndex === -1) {
      // Reuse detection: revoke all sessions if a revoked session token is re-presented
      user.refreshSessions = [];
      await user.save();
      throw new UnauthorizedException(
        'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
      );
    }

    const session = user.refreshSessions[sessionIndex];
    if (session.expiresAt < new Date()) {
      user.refreshSessions.splice(sessionIndex, 1);
      await user.save();
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    const isTokenValid = await bcrypt.compare(
      this.sha256(rawRefreshToken),
      session.tokenHash,
    );
    if (!isTokenValid) {
      // Token rotation mismatch -> revoke all sessions
      user.refreshSessions = [];
      await user.save();
      throw new UnauthorizedException(
        'Phát hiện bất thường phiên đăng nhập. Vui lòng đăng nhập lại.',
      );
    }

    // Rotate session token
    user.refreshSessions.splice(sessionIndex, 1);
    const tokens = await this.issueSessionTokens(user, userAgent);
    const profile = await this.profileModel.findOne({ userId: user._id });

    return {
      user: this.sanitizeUserResponse(user, profile),
      ...tokens,
    };
  }

  async logout(userId: string, sessionId?: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+refreshSessions');
    if (!user) return { revoked: true };

    if (sessionId) {
      user.refreshSessions = user.refreshSessions.filter(
        (s) => s.sessionId !== sessionId,
      );
    } else {
      user.refreshSessions = [];
    }
    await user.save();
    return { revoked: true };
  }

  async revokeAllSessions(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { refreshSessions: [] },
    });
    return { message: 'Đã thu hồi toàn bộ phiên đăng nhập trên mọi thiết bị' };
  }

  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const profile = await this.profileModel.findOne({ userId: user._id });
    return this.sanitizeUserResponse(user, profile);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userModel.findOne({ email });
    // Always return generic message to avoid user enumeration
    if (!user) {
      return {
        message:
          'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được tạo.',
      };
    }

    const rawResetToken = crypto.randomBytes(24).toString('hex');
    user.resetPasswordTokenHash = this.sha256(rawResetToken);
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    return {
      message:
        'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được tạo.',
      // Returned in development mode only so manual testing can verify reset flow without SMTP server
      ...(this.configService.get<string>('nodeEnv') !== 'production'
        ? { devResetTokenPreview: rawResetToken }
        : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email })
      .select('+resetPasswordTokenHash +resetPasswordExpiresAt +refreshSessions');

    if (
      !user ||
      !user.resetPasswordTokenHash ||
      !user.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      );
    }

    const incomingHash = this.sha256(dto.resetToken);
    if (incomingHash !== user.resetPasswordTokenHash) {
      throw new BadRequestException('Mã đặt lại mật khẩu không chính xác');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.refreshSessions = [];
    await user.save();

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel
      .findById(userId)
      .select('+passwordHash +refreshSessions');
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.refreshSessions = [];
    await user.save();

    return {
      message: 'Đổi mật khẩu thành công. Các phiên đăng nhập cũ đã được thu hồi.',
    };
  }

  getGoogleOAuthStatus() {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const configured = Boolean(clientId && clientSecret);
    return {
      provider: 'google',
      configured,
      message: configured
        ? 'Google OAuth đã sẵn sàng'
        : 'Google OAuth chưa được cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong .env',
    };
  }

  private async issueSessionTokens(user: UserDocument, userAgent?: string) {
    const sessionId = crypto.randomUUID();
    const payload = {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      sessionId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn') || '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') || '7d',
    });

    const tokenHash = await bcrypt.hash(this.sha256(refreshToken), 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Keep max 5 active sessions per user
    const currentSessions = (user.refreshSessions || []).filter(
      (s) => s.expiresAt > new Date(),
    );
    if (currentSessions.length >= 5) {
      currentSessions.shift();
    }

    currentSessions.push({
      sessionId,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      userAgent: userAgent?.slice(0, 200),
    });

    user.refreshSessions = currentSessions;
    await user.save();

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  private sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private sanitizeUserResponse(
    user: UserDocument,
    profile?: ProfileDocument | null,
  ) {
    return {
      id: String(user._id),
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      profile: profile
        ? {
            username: profile.username,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            coverUrl: profile.coverUrl,
            bio: profile.bio,
            city: profile.city,
            experienceLevel: profile.experienceLevel,
            favoriteActivities: profile.favoriteActivities,
            followersCount: profile.followersCount,
            followingCount: profile.followingCount,
            trustScore: profile.trustScore,
          }
        : null,
    };
  }
}
