import { apiClient } from './api';
import {
  AiConversationItem,
  AiConversationStatus,
  AiMessageItem,
  AiTurnResponse,
  ChecklistPreviewItem,
  ValidatedTripState,
} from '../types';

export function createDefaultTripState(): ValidatedTripState {
  return {
    intent: null,
    destination: null,
    route: null,
    activity: null,
    departureDate: null,
    endDate: null,
    durationDays: null,
    travelers: null,
    experienceLevel: null,
    ownedGear: [],
    budgetVnd: null,
    pickupArea: null,
    wantsToRent: false,
    notes: null,
    ambiguousFields: [],
  };
}

export function normalizeTripState(raw: any): ValidatedTripState {
  const base = createDefaultTripState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    intent: raw.intent ?? null,
    destination: raw.destination ?? null,
    route: raw.route ?? null,
    activity: raw.activity ?? null,
    departureDate: raw.departureDate ?? null,
    endDate: raw.endDate ?? null,
    durationDays:
      typeof raw.durationDays === 'number' ? raw.durationDays : null,
    travelers: typeof raw.travelers === 'number' ? raw.travelers : null,
    experienceLevel: raw.experienceLevel ?? null,
    ownedGear: Array.isArray(raw.ownedGear) ? raw.ownedGear : [],
    budgetVnd: typeof raw.budgetVnd === 'number' ? raw.budgetVnd : null,
    pickupArea: raw.pickupArea ?? null,
    wantsToRent: Boolean(raw.wantsToRent),
    notes: raw.notes ?? null,
    ambiguousFields: Array.isArray(raw.ambiguousFields)
      ? raw.ambiguousFields
      : [],
  };
}

export function normalizeAiConversation(raw: any): AiConversationItem {
  if (!raw) {
    return {
      id: '',
      conversationId: '',
      sessionId: '',
      userId: '',
      title: 'Tư vấn chuyến đi mới',
      status: 'NEEDS_INFORMATION',
      stateVersion: 1,
      tripState: createDefaultTripState(),
      missingFields: ['destination', 'activity', 'durationDays', 'travelers'],
      nextQuestion: null,
      lastMessagePreview: '',
      lastMessageAt: null,
      checklistPreview: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const id = String(raw.id || raw.conversationId || raw._id || '');
  return {
    id,
    conversationId: id,
    sessionId: id,
    userId: String(raw.userId || ''),
    title: raw.title || 'Tư vấn chuyến đi mới',
    status: (raw.status || 'NEEDS_INFORMATION') as AiConversationStatus,
    stateVersion: Number(raw.stateVersion || 1),
    tripState: normalizeTripState(raw.tripState || raw.parsedRequirements),
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields : [],
    nextQuestion: raw.nextQuestion ?? null,
    lastMessagePreview: raw.lastMessagePreview || '',
    lastMessageAt: raw.lastMessageAt || null,
    travelPlanId: raw.travelPlanId ? String(raw.travelPlanId) : null,
    checklistId: raw.checklistId ? String(raw.checklistId) : null,
    checklistPreview: Array.isArray(raw.checklistPreview)
      ? raw.checklistPreview
      : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function normalizeAiMessage(raw: any): AiMessageItem {
  return {
    id: String(raw.id || raw._id || ''),
    aiConversationId: String(
      raw.aiConversationId || raw.conversationId || '',
    ),
    conversationId: String(raw.conversationId || raw.aiConversationId || ''),
    role: raw.role || 'assistant',
    content: String(raw.content || ''),
    clientMessageId: raw.clientMessageId || undefined,
    replyToMessageId: raw.replyToMessageId
      ? String(raw.replyToMessageId)
      : undefined,
    stateVersion: Number(raw.stateVersion || 1),
    structuredPayload: raw.structuredPayload || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    deliveryState: raw.deliveryState || 'SENT',
  };
}

export const aiService = {
  async createConversation(payload?: {
    title?: string;
    initialMessage?: string;
    clientMessageId?: string;
  }): Promise<AiConversationItem & { initialTurn?: AiTurnResponse }> {
    const { data } = await apiClient.post('/ai/conversations', payload || {});
    const raw = data.data || {};
    const conv = normalizeAiConversation(raw);
    return {
      ...conv,
      initialTurn: raw.initialTurn,
    };
  },

  async listConversations(): Promise<AiConversationItem[]> {
    const { data } = await apiClient.get('/ai/conversations');
    const items = Array.isArray(data.data) ? data.data : [];
    return items.map(normalizeAiConversation);
  },

  async getConversationById(id: string): Promise<AiConversationItem> {
    const { data } = await apiClient.get(`/ai/conversations/${id}`);
    return normalizeAiConversation(data.data);
  },

  async getMessages(
    conversationId: string,
    params?: { beforeId?: string; limit?: number },
  ): Promise<{
    conversationId: string;
    conversation: AiConversationItem;
    items: AiMessageItem[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const { data } = await apiClient.get(
      `/ai/conversations/${conversationId}/messages`,
      { params },
    );
    const raw = data.data || {};
    return {
      conversationId: String(raw.conversationId || conversationId),
      conversation: normalizeAiConversation(raw.conversation),
      items: Array.isArray(raw.items) ? raw.items.map(normalizeAiMessage) : [],
      nextCursor: raw.nextCursor || null,
      hasMore: Boolean(raw.hasMore),
    };
  },

  async sendMessage(
    conversationId: string,
    payload: {
      content: string;
      clientMessageId: string;
      simulateError?: 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'INVALID_SCHEMA';
    },
  ): Promise<AiTurnResponse> {
    const { data } = await apiClient.post(
      `/ai/conversations/${conversationId}/messages`,
      payload,
    );
    const raw = data.data || {};
    return {
      conversationId: String(raw.conversationId || conversationId),
      deduplicated: Boolean(raw.deduplicated),
      status: (raw.status || 'NEEDS_INFORMATION') as AiConversationStatus,
      stateVersion: Number(raw.stateVersion || 1),
      reply: String(raw.reply || ''),
      userMessage: normalizeAiMessage(raw.userMessage),
      assistantMessage: raw.assistantMessage
        ? normalizeAiMessage(raw.assistantMessage)
        : null,
      tripState: normalizeTripState(raw.tripState),
      missingFields: Array.isArray(raw.missingFields) ? raw.missingFields : [],
      nextQuestion: raw.nextQuestion ?? null,
      checklistPreview: Array.isArray(raw.checklistPreview)
        ? (raw.checklistPreview as ChecklistPreviewItem[])
        : [],
      providerMeta: raw.providerMeta,
      conversation: normalizeAiConversation(raw.conversation),
    };
  },
};
