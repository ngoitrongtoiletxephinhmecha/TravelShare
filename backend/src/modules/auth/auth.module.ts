import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthEventsService } from './auth-events.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  GoogleCallbackGuard,
  GoogleOAuthGuard,
  GoogleStrategy,
} from './strategies/google.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthEventsService,
    JwtStrategy,
    GoogleStrategy,
    GoogleOAuthGuard,
    GoogleCallbackGuard,
  ],
  exports: [AuthService, AuthEventsService, JwtStrategy],
})
export class AuthModule {}
