import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [ChatsController],
  providers: [ChatsService, RealtimeGateway],
  exports: [ChatsService, RealtimeGateway],
})
export class ChatsModule {}
