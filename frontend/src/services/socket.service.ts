import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import {
  ChatMessageItem,
  ConversationItem,
  NotificationItem,
} from '../types';
import {
  chatService,
  normalizeChatMessage,
  normalizeConversation,
} from './chat.service';
import { normalizeNotification } from './notification.service';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
const socketServerUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '');

export interface ReadReceiptEventPayload {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
}

type MessageListener = (message: ChatMessageItem) => void;
type ReadReceiptListener = (receipt: ReadReceiptEventPayload) => void;
type NotificationListener = (notification: NotificationItem) => void;
type ReconnectListener = () => void;

class SocketRealtimeManager {
  private socket: Socket | null = null;
  private currentToken: string | null = null;
  private hadConnectedOnce = false;

  private messageListeners = new Set<MessageListener>();
  private readReceiptListeners = new Set<ReadReceiptListener>();
  private notificationListeners = new Set<NotificationListener>();
  private reconnectListeners = new Set<ReconnectListener>();

  connect(): Socket | null {
    const token = useAuthStore.getState().accessToken;
    const isAuthenticated = useAuthStore.getState().isAuthenticated;

    if (!isAuthenticated || !token) {
      this.disconnect();
      return null;
    }

    if (this.socket && this.currentToken === token) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.hadConnectedOnce = false;

    const socket = io(socketServerUrl, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      if (this.hadConnectedOnce) {
        this.reconnectListeners.forEach((cb) => {
          try {
            cb();
          } catch {
            // ignore listener error
          }
        });
      }
      this.hadConnectedOnce = true;
    });

    socket.on('message:new', (rawMsg: any) => {
      const normalized = normalizeChatMessage(rawMsg);
      this.messageListeners.forEach((cb) => {
        try {
          cb(normalized);
        } catch {
          // ignore listener error
        }
      });
    });

    socket.on('conversation:read', (rawReceipt: any) => {
      if (!rawReceipt?.conversationId) return;
      const payload: ReadReceiptEventPayload = {
        conversationId: String(rawReceipt.conversationId),
        userId: String(rawReceipt.userId || ''),
        lastReadMessageId: rawReceipt.lastReadMessageId
          ? String(rawReceipt.lastReadMessageId)
          : null,
        lastReadAt: rawReceipt.lastReadAt || new Date().toISOString(),
      };
      this.readReceiptListeners.forEach((cb) => {
        try {
          cb(payload);
        } catch {
          // ignore listener error
        }
      });
    });

    socket.on('notification:new', (rawNotif: any) => {
      const normalized = normalizeNotification(rawNotif);
      this.notificationListeners.forEach((cb) => {
        try {
          cb(normalized);
        } catch {
          // ignore listener error
        }
      });
    });

    this.socket = socket;
    return socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.hadConnectedOnce = false;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  async joinConversation(conversationId: string): Promise<boolean> {
    const socket = this.connect();
    if (!socket) return false;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 4000);
      socket.emit(
        'conversation:join',
        { conversationId },
        (ack: { status?: string }) => {
          clearTimeout(timer);
          resolve(ack?.status === 'OK');
        },
      );
    });
  }

  /**
   * Send message via Socket.IO `message:send` with durable MongoDB ACK.
   * Falls back to REST `/chats/conversations/:id/messages` with the SAME `clientMessageId`
   * if the socket is temporarily offline, guaranteeing idempotency without duplicate messages.
   */
  async sendMessage(params: {
    conversationId: string;
    content: string;
    clientMessageId: string;
    gearId?: string;
    bookingId?: string;
  }): Promise<{
    message: ChatMessageItem;
    conversation: ConversationItem;
    deduplicated: boolean;
  }> {
    const socket = this.connect();

    if (socket && socket.connected) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(async () => {
          // Fallback to REST with the exact same clientMessageId
          try {
            const restRes = await chatService.sendMessageRest(
              params.conversationId,
              {
                content: params.content,
                clientMessageId: params.clientMessageId,
                gearId: params.gearId,
                bookingId: params.bookingId,
              },
            );
            resolve(restRes);
          } catch (err) {
            reject(err);
          }
        }, 5000);

        socket.emit('message:send', params, (ack: any) => {
          clearTimeout(timeoutId);
          if (ack?.status === 'OK' && ack.message) {
            resolve({
              message: normalizeChatMessage(ack.message),
              conversation: normalizeConversation(ack.conversation || {}),
              deduplicated: Boolean(ack.deduplicated),
            });
          } else {
            reject(
              new Error(ack?.message || 'Không thể gửi tin nhắn qua Socket.IO'),
            );
          }
        });
      });
    }

    // If socket is not currently connected, send over REST with the same clientMessageId
    return chatService.sendMessageRest(params.conversationId, {
      content: params.content,
      clientMessageId: params.clientMessageId,
      gearId: params.gearId,
      bookingId: params.bookingId,
    });
  }

  async markRead(
    conversationId: string,
    lastReadMessageId?: string,
  ): Promise<void> {
    const socket = this.connect();
    if (socket && socket.connected) {
      socket.emit('conversation:read', {
        conversationId,
        lastReadMessageId,
      });
    } else {
      await chatService.markConversationRead(conversationId, lastReadMessageId);
    }
  }

  onNewMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onReadReceipt(listener: ReadReceiptListener): () => void {
    this.readReceiptListeners.add(listener);
    return () => {
      this.readReceiptListeners.delete(listener);
    };
  }

  onNewNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  onReconnect(listener: ReconnectListener): () => void {
    this.reconnectListeners.add(listener);
    return () => {
      this.reconnectListeners.delete(listener);
    };
  }
}

export const socketService = new SocketRealtimeManager();
