import { apiClient } from './api';
import {
  ChatMessageItem,
  ConversationItem,
  ConversationParticipant,
  CursorMessagesResult,
} from '../types';

export interface OpenConversationPayload {
  targetUserId: string;
  gearId?: string;
  bookingId?: string;
}

export interface SendChatMessagePayload {
  content: string;
  clientMessageId: string;
  gearId?: string;
  bookingId?: string;
}

export function normalizeParticipant(raw: any): ConversationParticipant {
  if (!raw) {
    return {
      id: '',
      username: 'member',
      fullName: 'Thành viên TravelShare',
      avatarUrl: '',
      isVerified: false,
    };
  }
  return {
    id: String(raw.id || raw.userId || raw._id || ''),
    username: raw.username || 'member',
    fullName: raw.fullName || 'Thành viên TravelShare',
    avatarUrl: raw.avatarUrl || '',
    isVerified: Boolean(raw.isVerified ?? true),
  };
}

export function normalizeContextCard(raw: any) {
  if (!raw) return null;
  return {
    type: raw.type as 'GEAR' | 'BOOKING',
    referenceId: String(raw.refId || raw.referenceId || ''),
    title: raw.title || '',
    subtitle: raw.subtitle || '',
    imageUrl: raw.imageUrl || '',
    status: raw.status || undefined,
    targetUrl: raw.targetUrl || '',
  };
}

export function normalizeConversation(raw: any): ConversationItem {
  return {
    id: String(raw.id || raw._id || ''),
    participantPairKey: raw.participantPairKey || '',
    participants: Array.isArray(raw.participants)
      ? raw.participants.map((p: any) =>
          typeof p === 'string'
            ? {
                id: p,
                username: '',
                fullName: '',
                avatarUrl: '',
                isVerified: false,
              }
            : normalizeParticipant(p),
        )
      : [],
    partner: raw.partner ? normalizeParticipant(raw.partner) : null,
    activeContext: normalizeContextCard(raw.activeContext),
    lastMessageId: raw.lastMessageId ? String(raw.lastMessageId) : undefined,
    lastMessageSenderId: raw.lastMessageSenderId
      ? String(raw.lastMessageSenderId)
      : undefined,
    lastMessagePreview: raw.lastMessagePreview || '',
    lastMessageAt: raw.lastMessageAt || null,
    unreadCount: Number(raw.unreadCount || 0),
    readReceipts: raw.readReceipts || {},
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function normalizeChatMessage(raw: any): ChatMessageItem {
  return {
    id: String(raw.id || raw._id || ''),
    conversationId: String(raw.conversationId || ''),
    senderId: String(raw.senderId || ''),
    clientMessageId: raw.clientMessageId || undefined,
    text: String(raw.content ?? raw.text ?? ''),
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    contextCard: normalizeContextCard(raw.contextCard),
    readBy: Array.isArray(raw.readBy)
      ? raw.readBy.map((id: any) => String(id))
      : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    sender: normalizeParticipant(raw.sender),
    deliveryState: raw.deliveryState || 'SENT',
  };
}

export const chatService = {
  async openConversation(
    payload: OpenConversationPayload,
  ): Promise<ConversationItem> {
    const { data } = await apiClient.post('/chats/conversations/open', payload);
    return normalizeConversation(data.data);
  },

  async listConversations(): Promise<ConversationItem[]> {
    const { data } = await apiClient.get('/chats/conversations');
    const items = Array.isArray(data.data) ? data.data : [];
    return items.map(normalizeConversation);
  },

  async getConversationById(id: string): Promise<ConversationItem> {
    const { data } = await apiClient.get(`/chats/conversations/${id}`);
    return normalizeConversation(data.data);
  },

  async getMessages(
    conversationId: string,
    params?: {
      beforeId?: string;
      afterId?: string;
      limit?: number;
    },
  ): Promise<CursorMessagesResult> {
    const { data } = await apiClient.get(
      `/chats/conversations/${conversationId}/messages`,
      { params },
    );
    const raw = data.data || {};
    return {
      items: Array.isArray(raw.items)
        ? raw.items.map(normalizeChatMessage)
        : [],
      nextCursor: raw.nextCursor || null,
      hasMore: Boolean(raw.hasMore),
      readReceipts: raw.readReceipts || {},
    };
  },

  async sendMessageRest(
    conversationId: string,
    payload: SendChatMessagePayload,
  ): Promise<{
    message: ChatMessageItem;
    conversation: ConversationItem;
    deduplicated: boolean;
  }> {
    const { data } = await apiClient.post(
      `/chats/conversations/${conversationId}/messages`,
      payload,
    );
    const raw = data.data;
    return {
      message: normalizeChatMessage(raw.message),
      conversation: normalizeConversation(raw.conversation),
      deduplicated: Boolean(raw.deduplicated),
    };
  },

  async markConversationRead(
    conversationId: string,
    lastReadMessageId?: string,
  ): Promise<{
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
  }> {
    const { data } = await apiClient.post(
      `/chats/conversations/${conversationId}/read`,
      { lastReadMessageId },
    );
    return data.data;
  },
};
