import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import {
  JwtAuthGuard,
  verifyCsrfForCookieRequest,
} from '../../common/guards/jwt-auth.guard';
import {
  GoogleCallbackGuard,
  GoogleOAuthGuard,
  GoogleOAuthUserProfile,
  sanitizeRelativeRedirect,
} from './strategies/google.strategy';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Cấp hoặc lấy CSRF token cho phiên trình duyệt dùng Cookie HttpOnly' })
  getCsrfToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existing =
      typeof req.cookies?.['ts_csrf_token'] === 'string' &&
      req.cookies['ts_csrf_token'].length >= 16
        ? req.cookies['ts_csrf_token']
        : crypto.randomBytes(24).toString('hex');
    this.setCsrfCookie(res, existing);
    return { csrfToken: existing };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới bằng email và mật khẩu' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      dto,
      req.headers['user-agent'],
    );
    const csrfToken = this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );
    return { ...result, csrfToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập và nhận Access/Refresh Token' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req.headers['user-agent']);
    const csrfToken = this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );
    return { ...result, csrfToken };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token bằng Refresh Token Rotation' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefreshToken = req.cookies?.['ts_refresh_token'];
    const usingCookie = !dto.refreshToken && Boolean(cookieRefreshToken);

    if (usingCookie) {
      const corsOrigins =
        this.configService.get<string[]>('corsOrigins') || [];
      const isProduction =
        this.configService.get<boolean>('isProduction') || false;
      verifyCsrfForCookieRequest(req, corsOrigins, isProduction);
    }

    const rawRefreshToken = dto.refreshToken || cookieRefreshToken;
    const result = await this.authService.refreshTokens(
      rawRefreshToken,
      req.headers['user-agent'],
    );
    const csrfToken = this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );
    return { ...result, csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất và thu hồi phiên hiện tại' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearAuthCookies(res);
    return this.authService.logout(user.userId, user.sessionId);
  }

  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thu hồi toàn bộ phiên đăng nhập trên mọi thiết bị' })
  async revokeAllSessions(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearAuthCookies(res);
    return this.authService.revokeAllSessions(user.userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  async getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu đặt lại mật khẩu khi quên' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu mới bằng token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu cho người dùng đang đăng nhập' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @Public()
  @Get('google/status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái cấu hình Google OAuth' })
  getGoogleStatus() {
    return this.authService.getGoogleOAuthStatus();
  }

  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  @ApiOperation({ summary: 'Chuyển hướng đăng nhập qua Google OAuth 2.0' })
  googleLogin() {
    // Redirect handled by Passport GoogleOAuthGuard
  }

  @Public()
  @UseGuards(GoogleCallbackGuard)
  @Get('google/callback')
  @ApiOperation({ summary: 'Callback xử lý đăng nhập Google OAuth 2.0 và cấp HttpOnly cookie' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:5173';
    const redirectPath = sanitizeRelativeRedirect(req.cookies?.['ts_oauth_redirect']);
    res.clearCookie('ts_oauth_redirect', { path: '/' });

    try {
      const googleUser = req.user as GoogleOAuthUserProfile | undefined;
      if (!googleUser) {
        return res.redirect(`${frontendUrl}/login?oauthError=oauth_failed`);
      }

      const result = await this.authService.loginWithGoogle(
        googleUser,
        req.headers['user-agent'],
      );
      this.setAuthCookies(res, result.accessToken, result.refreshToken);

      return res.redirect(
        `${frontendUrl}/auth/google/callback?redirect=${encodeURIComponent(redirectPath)}`,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        return res.redirect(
          `${frontendUrl}/login?oauthError=account_locked&message=${encodeURIComponent(err.message)}`,
        );
      }
      return res.redirect(
        `${frontendUrl}/login?oauthError=oauth_failed&message=${encodeURIComponent(err?.message || 'Đăng nhập Google thất bại')}`,
      );
    }
  }

  private getCookieOptions(): CookieOptions {
    const secure = this.configService.get<boolean>('jwt.cookieSecure') || false;
    const sameSite =
      this.configService.get<'lax' | 'strict' | 'none'>('jwt.cookieSameSite') ||
      'lax';
    const domain = this.configService.get<string>('jwt.cookieDomain');

    return {
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private setCsrfCookie(res: Response, csrfToken: string) {
    res.cookie('ts_csrf_token', csrfToken, {
      ...this.getCookieOptions(),
      httpOnly: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): string {
    const baseOpts = this.getCookieOptions();
    const csrfToken = crypto.randomBytes(24).toString('hex');

    res.cookie('ts_access_token', accessToken, {
      ...baseOpts,
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('ts_refresh_token', refreshToken, {
      ...baseOpts,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    this.setCsrfCookie(res, csrfToken);
    return csrfToken;
  }

  private clearAuthCookies(res: Response) {
    const baseOpts = this.getCookieOptions();
    res.clearCookie('ts_access_token', baseOpts);
    res.clearCookie('ts_refresh_token', baseOpts);
    res.clearCookie('ts_csrf_token', baseOpts);
  }
}
