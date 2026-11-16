import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { ChatsService } from './chats.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AuthEventsService,
  SessionRevocationEvent,
} from '../auth/auth-events.service';
import { User, UserDocument } from '../../database/schemas';
import { AccountStatus } from '../../common/enums/system.enums';
import { parseAllowedOrigins } from '../../config/configuration';
import { SendMessageDto } from './dto/chat.dto';

export interface AuthenticatedSocketUser {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

type SocketAuthFailureCode =
  | 'UNAUTHORIZED'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED';

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      const isProd = process.env.NODE_ENV === 'production';
      const allowed = parseAllowedOrigins(
        process.env.FRONTEND_URL || 'http://localhost:5173',
        process.env.CORS_ORIGINS,
        isProd,
      );
      const normalized = origin.replace(/\/+$/, '');
      if (allowed.includes(normalized)) {
        return callback(null, true);
      }
      if (
        !isProd &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} không được phép qua Socket.IO`), false);
    },
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
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
    @Optional()
    private readonly authEventsService?: AuthEventsService,
  ) {}

  onModuleInit() {
    this.notificationsService.registerRealtimeDispatcher(
      (recipientId: string, notification: Record<string, any>) => {
        this.emitNotificationToUser(recipientId, notification);
      },
    );

    this.authEventsService?.onSessionRevoked(async (event) => {
      await this.disconnectRevokedSockets(event);
    });
  }

  private extractSocketToken(client: Socket): string | null {
    const rawAuthToken = client.handshake?.auth?.token;
    const rawHeader = client.handshake?.headers?.authorization;
    const rawCookie = client.handshake?.headers?.cookie || '';

    if (typeof rawAuthToken === 'string' && rawAuthToken.trim()) {
      return rawAuthToken.replace(/^Bearer\s+/i, '').trim();
    }
    if (typeof rawHeader === 'string' && rawHeader.startsWith('Bearer ')) {
      return rawHeader.slice(7).trim();
    }
    if (rawCookie.includes('ts_access_token=')) {
      const match = rawCookie.match(/ts_access_token=([^;]+)/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }
    return null;
  }

  private async verifyClientSession(client: Socket): Promise<{
    user: AuthenticatedSocketUser | null;
    failureCode?: SocketAuthFailureCode;
    failureMessage?: string;
  }> {
    const token = this.extractSocketToken(client);
    if (!token) {
      return {
        user: null,
        failureCode: 'UNAUTHORIZED',
        failureMessage: 'Phiên kết nối Socket.IO chưa được xác thực',
      };
    }

    let payload: any;
    try {
      const secret =
        this.configService.get<string>('jwt.accessSecret') ||
        process.env.JWT_ACCESS_SECRET ||
        (process.env.NODE_ENV !== 'production'
          ? 'dev-access-secret-key-change-in-production-32chars'
          : '');
      payload = await this.jwtService.verifyAsync(token, { secret });
    } catch (err: any) {
      const isExpired =
        err?.name === 'TokenExpiredError' ||
        /expired/i.test(String(err?.message || ''));
      return {
        user: null,
        failureCode: isExpired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED',
        failureMessage: isExpired
          ? 'Token phiên đăng nhập đã hết hạn'
          : 'Token phiên kết nối không hợp lệ',
      };
    }

    if (!payload?.sub) {
      return {
        user: null,
        failureCode: 'UNAUTHORIZED',
        failureMessage: 'Token không hợp lệ',
      };
    }

    if (this.userModel) {
      const dbUser: any = await this.userModel
        .findById(payload.sub)
        .select('status role email +refreshSessions')
        .lean();

      if (!dbUser) {
        return {
          user: null,
          failureCode: 'UNAUTHORIZED',
          failureMessage: 'Tài khoản không tồn tại',
        };
      }

      if (dbUser.status !== AccountStatus.ACTIVE) {
        return {
          user: null,
          failureCode: 'ACCOUNT_LOCKED',
          failureMessage: `Tài khoản hiện đang ở trạng thái ${dbUser.status}. Kết nối realtime đã bị ngắt.`,
        };
      }

      if (payload.sessionId && Array.isArray(dbUser.refreshSessions)) {
        const now = new Date();
        const activeSession = dbUser.refreshSessions.some(
          (s: any) =>
            s.sessionId === payload.sessionId &&
            (!s.expiresAt || new Date(s.expiresAt) > now),
        );
        if (!activeSession) {
          return {
            user: null,
            failureCode: 'SESSION_REVOKED',
            failureMessage:
              'Phiên đăng nhập đã bị thu hồi hoặc đăng xuất. Vui lòng đăng nhập lại.',
          };
        }
      }
    }

    const authUser: AuthenticatedSocketUser = {
      userId: String(payload.sub),
      email: String(payload.email || ''),
      role: String(payload.role || 'USER'),
      sessionId: payload.sessionId ? String(payload.sessionId) : undefined,
    };
    client.data = client.data || {};
    client.data.user = authUser;

    return { user: authUser };
  }

  /**
   * Re-verify active JWT, account status, and session revocation on every connect and message event.
   */
  async authenticateClient(
    client: Socket,
  ): Promise<AuthenticatedSocketUser | null> {
    const check = await this.verifyClientSession(client);
    if (!check.user) {
      client.emit('auth:error', {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage || 'Phiên kết nối không hợp lệ',
      });
      client.disconnect(true);
      return null;
    }
    return check.user;
  }

  async disconnectRevokedSockets(
    event: SessionRevocationEvent,
  ): Promise<number> {
    if (!this.server) return 0;
    const room = `user:${String(event.userId)}`;
    let disconnected = 0;

    try {
      const sockets = await this.server.in(room).fetchSockets();
      const code: SocketAuthFailureCode =
        event.reason === 'ACCOUNT_LOCKED'
          ? 'ACCOUNT_LOCKED'
          : 'SESSION_REVOKED';
      const message =
        event.reason === 'ACCOUNT_LOCKED'
          ? 'Tài khoản của bạn đã bị khóa bởi quản trị viên.'
          : 'Phiên đăng nhập của bạn đã bị đăng xuất hoặc thu hồi.';

      for (const sock of sockets) {
        const sockSessionId = sock.data?.user?.sessionId;
        if (event.sessionId && sockSessionId && sockSessionId !== event.sessionId) {
          continue;
        }
        sock.emit('auth:error', {
          status: 'ERROR',
          code,
          reason: event.reason,
          message,
        });
        sock.disconnect(true);
        disconnected += 1;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to disconnect revoked sockets for user=${event.userId}: ${String(err)}`,
      );
    }

    return disconnected;
  }

  async handleConnection(client: Socket) {
    const authUser = await this.authenticateClient(client);
    if (!authUser) {
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
   * Join a conversation room after verifying active session and membership
   */
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const check = await this.verifyClientSession(client);
    if (!check.user) {
      client.emit('auth:error', {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage,
      });
      client.disconnect(true);
      return {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage || 'Vui lòng đăng nhập để tham gia hội thoại',
      };
    }

    try {
      const conv = await this.chatsService.getConversationById(
        payload?.conversationId,
        check.user.userId,
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
   * 1. Re-verify active session & account status
   * 2. Persist idempotently in MongoDB (`clientMessageId`) after checking conversation membership
   * 3. Emit `message:new` to recipient(s) & conversation room
   * 4. Return ACK to sender
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: SendMessageDto & { conversationId: string },
  ) {
    const check = await this.verifyClientSession(client);
    if (!check.user) {
      client.emit('auth:error', {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage,
      });
      client.disconnect(true);
      return {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage || 'Phiên kết nối không hợp lệ',
      };
    }

    try {
      const result = await this.chatsService.sendMessage(
        payload.conversationId,
        check.user.userId,
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
          check.user.userId,
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
    const check = await this.verifyClientSession(client);
    if (!check.user) {
      client.emit('auth:error', {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage,
      });
      client.disconnect(true);
      return {
        status: 'ERROR',
        code: check.failureCode || 'UNAUTHORIZED',
        message: check.failureMessage || 'Phiên kết nối không hợp lệ',
      };
    }

    try {
      const receipt = await this.chatsService.markConversationRead(
        payload.conversationId,
        check.user.userId,
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
