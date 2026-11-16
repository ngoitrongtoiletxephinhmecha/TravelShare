import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import * as crypto from 'crypto';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';

const UNSAFE_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function verifyCsrfForCookieRequest(
  req: Request,
  corsOrigins: string[] = [],
  isProduction = false,
): void {
  const originHeader = req.headers.origin as string | undefined;
  const refererHeader = req.headers.referer as string | undefined;
  const candidateOrigin = originHeader
    ? originHeader.replace(/\/+$/, '')
    : refererHeader
      ? (() => {
          try {
            return new URL(refererHeader).origin.replace(/\/+$/, '');
          } catch {
            return '';
          }
        })()
      : '';

  if (candidateOrigin) {
    const allowedLocal =
      !isProduction &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(candidateOrigin);
    if (!allowedLocal && corsOrigins.length > 0 && !corsOrigins.includes(candidateOrigin)) {
      throw new ForbiddenException(
        'Origin yêu cầu không khớp với cấu hình bảo mật CORS/CSRF',
      );
    }
  }

  const csrfCookie =
    typeof req.cookies?.['ts_csrf_token'] === 'string'
      ? req.cookies['ts_csrf_token']
      : '';
  const rawCsrfHeader = req.headers['x-csrf-token'];
  const csrfHeader =
    typeof rawCsrfHeader === 'string'
      ? rawCsrfHeader.trim()
      : Array.isArray(rawCsrfHeader)
        ? String(rawCsrfHeader[0] || '').trim()
        : '';

  if (
    !csrfCookie ||
    !csrfHeader ||
    csrfCookie.length !== csrfHeader.length ||
    !crypto.timingSafeEqual(Buffer.from(csrfCookie), Buffer.from(csrfHeader))
  ) {
    throw new ForbiddenException(
      'Thiếu hoặc sai mã chống giả mạo yêu cầu (X-CSRF-Token)',
    );
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      try {
        await super.canActivate(context);
      } catch {
        // Optional auth on public routes: ignore missing/invalid token
      }
      return true;
    }

    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) return false;

    const req = context.switchToHttp().getRequest<Request>();
    const method = String(req?.method || 'GET').toUpperCase();
    const authHeader = String(req?.headers?.authorization || '');
    const hasBearerToken = /^Bearer\s+\S+/i.test(authHeader);
    const hasAccessCookie = Boolean(req?.cookies?.['ts_access_token']);

    // Enforce CSRF protection when an unsafe state-changing request relies purely on HttpOnly cookie authentication
    if (UNSAFE_HTTP_METHODS.has(method) && !hasBearerToken && hasAccessCookie) {
      const corsOrigins =
        this.configService?.get<string[]>('corsOrigins') || [];
      const isProduction =
        this.configService?.get<boolean>('isProduction') || false;
      verifyCsrfForCookieRequest(req, corsOrigins, isProduction);
    }

    return true;
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return (user || null) as TUser;
    }

    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
        )
      );
    }
    return user;
  }
}
