import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

export interface GoogleOAuthUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

export function sanitizeRelativeRedirect(raw?: unknown): string {
  const val = typeof raw === 'string' ? raw.trim() : '';
  if (!val || !val.startsWith('/') || val.startsWith('//')) {
    return '/feed';
  }
  return val;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    const clientId = configService.get<string>('google.clientId');
    const clientSecret = configService.get<string>('google.clientSecret');
    const callbackUrl =
      configService.get<string>('google.callbackUrl') ||
      'http://localhost:4000/api/v1/auth/google/callback';

    super({
      // Fallback strings prevent Passport OAuth2Strategy constructor throw when Google OAuth is optional in test/CI
      clientID: clientId || 'unconfigured-google-client-id',
      clientSecret: clientSecret || 'unconfigured-google-client-secret',
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): void {
    const primaryEmail = profile?.emails?.[0];
    const email = primaryEmail?.value ? String(primaryEmail.value).trim() : '';
    const emailVerified =
      primaryEmail?.verified !== undefined
        ? Boolean(primaryEmail.verified)
        : Boolean(profile?._json?.email_verified ?? true);

    const fullName =
      profile?.displayName ||
      [profile?.name?.givenName, profile?.name?.familyName]
        .filter(Boolean)
        .join(' ') ||
      email.split('@')[0] ||
      'Thành viên TravelShare';

    const avatarUrl = profile?.photos?.[0]?.value || undefined;

    const result: GoogleOAuthUserProfile = {
      googleId: String(profile?.id || ''),
      email,
      fullName: String(fullName).trim(),
      avatarUrl,
      emailVerified,
    };

    done(null, result);
  }
}

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:5173';
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');

    if (!clientId || !clientSecret) {
      res.redirect(`${frontendUrl}/login?oauthError=not_configured`);
      return false;
    }

    const state = crypto.randomBytes(24).toString('hex');
    const redirectPath = sanitizeRelativeRedirect(req.query?.redirect);
    const cookieSecure =
      this.configService.get<boolean>('jwt.cookieSecure') || false;

    res.cookie('ts_oauth_state', state, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    res.cookie('ts_oauth_redirect', redirectPath, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });

    (req as any)._tsOAuthState = state;
    return (await super.canActivate(context)) as boolean;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    return {
      scope: ['email', 'profile'],
      state: (req as any)._tsOAuthState,
      prompt: 'select_account',
      session: false,
    };
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:5173';
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');

    if (!clientId || !clientSecret) {
      res.redirect(`${frontendUrl}/login?oauthError=not_configured`);
      return false;
    }

    if (req.query?.error) {
      res.clearCookie('ts_oauth_state', { path: '/' });
      res.clearCookie('ts_oauth_redirect', { path: '/' });
      res.redirect(`${frontendUrl}/login?oauthError=access_denied`);
      return false;
    }

    const queryState =
      typeof req.query?.state === 'string' ? req.query.state : '';
    const cookieState =
      typeof req.cookies?.ts_oauth_state === 'string'
        ? req.cookies.ts_oauth_state
        : '';

    const stateValid =
      Boolean(queryState && cookieState) &&
      queryState.length === cookieState.length &&
      crypto.timingSafeEqual(
        Buffer.from(queryState),
        Buffer.from(cookieState),
      );

    res.clearCookie('ts_oauth_state', { path: '/' });

    if (!stateValid) {
      res.clearCookie('ts_oauth_redirect', { path: '/' });
      res.redirect(`${frontendUrl}/login?oauthError=invalid_state`);
      return false;
    }

    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      res.clearCookie('ts_oauth_redirect', { path: '/' });
      res.redirect(`${frontendUrl}/login?oauthError=oauth_failed`);
      return false;
    }
  }

  getAuthenticateOptions() {
    return {
      session: false,
    };
  }
}
