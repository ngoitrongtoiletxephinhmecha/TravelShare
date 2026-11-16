import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { User, UserDocument } from '../../../database/schemas';
import { AccountStatus } from '../../../common/enums/system.enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    const accessSecret =
      configService.get<string>('jwt.accessSecret') ||
      process.env.JWT_ACCESS_SECRET ||
      (process.env.NODE_ENV !== 'production'
        ? 'dev-access-secret-key-change-in-production-32chars'
        : '');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.['ts_access_token'] || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user: any = await this.userModel
      .findById(payload.sub)
      .select('status role email +refreshSessions')
      .lean();

    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tài khoản hiện đang ở trạng thái ${user.status}. Vui lòng liên hệ quản trị viên.`,
      );
    }

    if (payload.sessionId && Array.isArray(user.refreshSessions)) {
      const now = new Date();
      const hasActiveSession = user.refreshSessions.some(
        (s: any) =>
          s.sessionId === payload.sessionId &&
          (!s.expiresAt || new Date(s.expiresAt) > now),
      );
      if (!hasActiveSession) {
        throw new UnauthorizedException(
          'Phiên đăng nhập đã bị thu hồi hoặc hết hạn. Vui lòng đăng nhập lại.',
        );
      }
    }

    return {
      userId: payload.sub,
      email: user.email || payload.email,
      role: user.role || payload.role,
      sessionId: payload.sessionId,
    };
  }
}
