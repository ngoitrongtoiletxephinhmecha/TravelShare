import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { MediaModule } from './modules/media/media.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { GearModule } from './modules/gear/gear.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ChatsModule } from './modules/chats/chats.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { MatchingModule } from './modules/matching/matching.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'backend/.env', '../.env'],
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PostsModule,
    MediaModule,
    CommunitiesModule,
    GearModule,
    BookingsModule,
    ChatsModule,
    NotificationsModule,
    AiModule,
    ChecklistsModule,
    MatchingModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
