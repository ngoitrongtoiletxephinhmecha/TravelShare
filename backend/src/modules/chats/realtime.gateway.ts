import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatsService } from './chats.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto } from './dto/chat.dto';

export interface AuthenticatedSocketUser {
  userId: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatsService: ChatsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.notificationsService.registerRealtimeDispatcher(
      (recipientId: string, notification: Record<string, any>) => {
        this.emitNotificationToUser(recipientId, notification);
      },
    );
  }

  /**
   * Extract & verify JWT token from Socket.IO handshake (auth.token, Authorization header, or cookie)
   */
  async authenticateClient(
    client: Socket,
  ): Promise<AuthenticatedSocketUser | null> {
    if (client.data?.user?.userId) {
      return client.data.user as AuthenticatedSocketUser;
    }

    const rawAuthToken = client.handshake?.auth?.token;
    const rawHeader = client.handshake?.headers?.authorization;
    const rawCookie = client.handshake?.headers?.cookie || '';

    let token: string | null = null;
    if (typeof rawAuthToken === 'string' && rawAuthToken.trim()) {
      token = rawAuthToken.replace(/^Bearer\s+/i, '').trim();
    } else if (typeof rawHeader === 'string' && rawHeader.startsWith('Bearer ')) {
      token = rawHeader.slice(7).trim();
    } else if (rawCookie.includes('ts_access_token=')) {
      const match = rawCookie.match(/ts_access_token=([^;]+)/);
      if (match?.[1]) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      return null;
    }

    try {
      const secret =
        this.configService.get<string>('jwt.accessSecret') ||
        'dev-access-secret-key-change-in-production-32chars';
      const payload = await this.jwtService.verifyAsync(token, { secret });
      if (!payload?.sub) {
        return null;
      }

      const authUser: AuthenticatedSocketUser = {
        userId: String(payload.sub),
        email: String(payload.email || ''),
        role: String(payload.role || 'USER'),
      };
      client.data = client.data || {};
      client.data.user = authUser;
      return authUser;
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const authUser = await this.authenticateClient(client);
    if (!authUser) {
      client.emit('auth:error', {
        status: 'ERROR',
        code: 'UNAUTHORIZED',
        message: 'Phiên kết nối Socket.IO chưa được xác thực',
      });
      client.disconnect(true);
      return;
    }

    await client.join(`user:${authUser.userId}`);
    this.logger.debug(
      `Socket connected: userId=${authUser.userId}, socketId=${client.id}`,
    );
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.user?.userId;
    if (userId) {
      this.logger.debug(
        `Socket disconnected: userId=${userId}, socketId=${client.id}`,
      );
    }
  }

  /**
   * Join a conversation room after verifying membership
   */
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const authUser = await this.authenticateClient(client);
    if (!authUser) {
      return {
        status: 'ERROR',
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tham gia hội thoại',
      };
    }

    try {
      const conv = await this.chatsService.getConversationById(
        payload?.conversationId,
        authUser.userId,
      );
      await client.join(`conversation:${conv.id}`);
      return {
        status: 'OK',
        conversationId: conv.id,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        code: err?.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        message: err?.message || 'Không có quyền truy cập hội thoại này',
      };
    }
  }

  /**
   * Send message over Socket.IO:
   * 1. Authenticate sender from socket session
   * 2. Persist idempotently in MongoDB (`clientMessageId`)
   * 3. Emit `message:new` to recipient(s) & conversation room
   * 4. Return ACK to sender
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: SendMessageDto & { conversationId: string },
  ) {
    const authUser = await this.authenticateClient(client);
    if (!authUser) {
      return {
        status: 'ERROR',
        code: 'UNAUTHORIZED',
        message: 'Phiên kết nối không hợp lệ',
      };
    }

    try {
      const result = await this.chatsService.sendMessage(
        payload.conversationId,
        authUser.userId,
        {
          content: payload.content,
          clientMessageId: payload.clientMessageId,
          gearId: payload.gearId,
          bookingId: payload.bookingId,
        },
      );

      if (!result.deduplicated) {
        this.broadcastNewMessage(
          payload.conversationId,
          result.message,
          result.recipientIds,
          authUser.userId,
        );
      }

      return {
        status: 'OK',
        message: result.message,
        conversation: result.conversation,
        deduplicated: result.deduplicated,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        code: err?.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        message: err?.message || 'Gửi tin nhắn thất bại',
      };
    }
  }

  /**
   * Mark conversation as read over Socket.IO
   */
  @SubscribeMessage('conversation:read')
  async handleMarkConversationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { conversationId: string; lastReadMessageId?: string },
  ) {
    const authUser = await this.authenticateClient(client);
    if (!authUser) {
      return {
        status: 'ERROR',
        code: 'UNAUTHORIZED',
        message: 'Phiên kết nối không hợp lệ',
      };
    }

    try {
      const receipt = await this.chatsService.markConversationRead(
        payload.conversationId,
        authUser.userId,
        { lastReadMessageId: payload.lastReadMessageId },
      );

      this.broadcastReadReceipt(receipt);
      return {
        status: 'OK',
        ...receipt,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        code: err?.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        message: err?.message || 'Không thể cập nhật trạng thái đã đọc',
      };
    }
  }

  broadcastNewMessage(
    conversationId: string,
    message: Record<string, any>,
    recipientIds: string[],
    senderId: string,
  ) {
    if (!this.server) return;
    this.server.to(`conversation:${conversationId}`).emit('message:new', message);
    this.server.to(`user:${senderId}`).emit('message:new', message);
    for (const rId of recipientIds) {
      this.server.to(`user:${rId}`).emit('message:new', message);
    }
  }

  broadcastReadReceipt(receipt: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    otherParticipantIds: string[];
  }) {
    if (!this.server) return;
    this.server
      .to(`conversation:${receipt.conversationId}`)
      .emit('conversation:read', receipt);
    for (const rId of receipt.otherParticipantIds) {
      this.server.to(`user:${rId}`).emit('conversation:read', receipt);
    }
  }

  emitNotificationToUser(
    recipientId: string,
    notification: Record<string, any>,
  ) {
    if (!this.server) return;
    this.server
      .to(`user:${String(recipientId)}`)
      .emit('notification:new', notification);
  }
}
