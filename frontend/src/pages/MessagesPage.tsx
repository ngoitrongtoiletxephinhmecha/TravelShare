import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { chatService } from '../services/chat.service';
import { socketService } from '../services/socket.service';
import { useAuthStore } from '../store/auth.store';
import {
  ChatMessageItem,
  ConversationContextCard,
  ConversationItem,
} from '../types';
import { Avatar, Badge, Button, Card } from '../components/ui/DesignSystem';
import { formatRelativeTime } from '../utils/format';

function generateClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cmsg-${crypto.randomUUID()}`;
  }
  return `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Merge message lists by `id` and `clientMessageId` in chronological order without duplicates
 */
function mergeMessagesUnique(
  existing: ChatMessageItem[],
  incoming: ChatMessageItem[],
): ChatMessageItem[] {
  const result = [...existing];

  for (const msg of incoming) {
    const idxById = result.findIndex(
      (m) =>
        (msg.id && m.id === msg.id) ||
        (msg.clientMessageId &&
          m.clientMessageId &&
          m.clientMessageId === msg.clientMessageId),
    );

    if (idxById >= 0) {
      result[idxById] = {
        ...result[idxById],
        ...msg,
        deliveryState: msg.deliveryState || 'SENT',
        errorMessage: undefined,
      };
    } else {
      result.push(msg);
    }
  }

  return result.sort((a, b) => {
    const tA = new Date(a.createdAt).getTime();
    const tB = new Date(b.createdAt).getTime();
    if (tA !== tB) return tA - tB;
    return String(a.id).localeCompare(String(b.id));
  });
}

const ContextCardBanner: React.FC<{
  card: ConversationContextCard;
  compact?: boolean;
}> = ({ card, compact = false }) => {
  const isBooking = card.type === 'BOOKING';
  return (
    <Link
      to={card.targetUrl}
      className={`group flex items-center justify-between gap-3 rounded-xl border transition-all ${
        isBooking
          ? 'border-amber-200 bg-amber-50/80 hover:bg-amber-100/70'
          : 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/70'
      } ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.title}
            className={`${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            } rounded-lg object-cover border border-white shadow-sm shrink-0`}
          />
        ) : (
          <div
            className={`${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            } rounded-lg flex items-center justify-center shrink-0 ${
              isBooking
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isBooking ? <Calendar size={18} /> : <Package size={18} />}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant={isBooking ? 'amber' : 'emerald'}>
              {isBooking ? 'Giao dịch Booking' : 'Thiết bị Gear'}
            </Badge>
            {card.status && (
              <span className="text-[11px] font-semibold text-slate-600">
                • {card.status}
              </span>
            )}
          </div>
          <p className="font-semibold text-slate-900 truncate mt-0.5">
            {card.title}
          </p>
          {card.subtitle && (
            <p className="text-xs text-slate-600 truncate">{card.subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0 group-hover:translate-x-0.5 transition-transform">
        <span className="hidden sm:inline">Xem chi tiết</span>
        <ExternalLink size={14} />
      </div>
    </Link>
  );
};

export const MessagesPage: React.FC = () => {
  const { id: activeConversationId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const currentUserId = user?.id || '';

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingInitialMessages, setLoadingInitialMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(
    null,
  );
  const [inputText, setInputText] = useState('');
  const [attachActiveContext, setAttachActiveContext] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Load conversation list
  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => chatService.listConversations(),
    refetchInterval: 30000,
  });

  // Load active conversation detail (also validates membership if user navigated directly to /messages/:id)
  const {
    data: activeConversationDetail,
    error: activeConvQueryError,
    isLoading: isLoadingActiveConv,
  } = useQuery({
    queryKey: ['chat-conversation', activeConversationId],
    queryFn: () => chatService.getConversationById(activeConversationId!),
    enabled: Boolean(activeConversationId),
    retry: false,
  });

  const activeConversation: ConversationItem | null = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      activeConversationDetail ||
      conversations.find((c) => c.id === activeConversationId) ||
      null
    );
  }, [activeConversationId, activeConversationDetail, conversations]);

  // Connect socket on mount
  useEffect(() => {
    socketService.connect();
  }, []);

  // Load initial message history when switching activeConversationId
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setNextCursor(null);
      setHasMoreOlder(false);
      setConversationError(null);
      return;
    }

    let cancelled = false;
    setLoadingInitialMessages(true);
    setConversationError(null);

    (async () => {
      try {
        await socketService.joinConversation(activeConversationId);
        const res = await chatService.getMessages(activeConversationId, {
          limit: 30,
        });
        if (cancelled) return;

        setMessages(res.items);
        setNextCursor(res.nextCursor);
        setHasMoreOlder(res.hasMore);

        // Mark conversation as read if there are messages
        const lastMsg = res.items[res.items.length - 1];
        await socketService.markRead(activeConversationId, lastMsg?.id);
        queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          'Không thể tải lịch sử hội thoại này';
        setConversationError(msg);
      } finally {
        if (!cancelled) {
          setLoadingInitialMessages(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, queryClient]);

  // Handle older messages pagination (`beforeId`)
  const handleLoadOlderMessages = async () => {
    if (!activeConversationId || !nextCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const res = await chatService.getMessages(activeConversationId, {
        beforeId: nextCursor,
        limit: 25,
      });
      setMessages((prev) => mergeMessagesUnique(res.items, prev));
      setNextCursor(res.nextCursor);
      setHasMoreOlder(res.hasMore);
    } catch {
      // ignore error
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Reconnect delta sync: fetch missed messages strictly after latest saved message ID
  const syncMissedMessagesOnReconnect = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    if (!activeConversationId) return;

    await socketService.joinConversation(activeConversationId);

    const savedMessages = messages.filter(
      (m) => m.deliveryState !== 'SENDING' && m.deliveryState !== 'FAILED' && !m.id.startsWith('temp-'),
    );
    const latestSavedId = savedMessages[savedMessages.length - 1]?.id;

    try {
      const res = await chatService.getMessages(activeConversationId, {
        afterId: latestSavedId,
        limit: 50,
      });
      if (res.items.length > 0) {
        setMessages((prev) => mergeMessagesUnique(prev, res.items));
        const newest = res.items[res.items.length - 1];
        await socketService.markRead(activeConversationId, newest.id);
      }
    } catch {
      // ignore
    }
  }, [activeConversationId, messages, queryClient]);

  useEffect(() => {
    const unsubReconnect = socketService.onReconnect(() => {
      syncMissedMessagesOnReconnect();
    });
    return unsubReconnect;
  }, [syncMissedMessagesOnReconnect]);

  // Listen for realtime incoming `message:new` and `conversation:read`
  useEffect(() => {
    const unsubMsg = socketService.onNewMessage((incomingMsg) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });

      if (incomingMsg.conversationId === activeConversationId) {
        setMessages((prev) => mergeMessagesUnique(prev, [incomingMsg]));

        if (incomingMsg.senderId !== currentUserId) {
          socketService.markRead(activeConversationId, incomingMsg.id);
        }

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    });

    const unsubRead = socketService.onReadReceipt((receipt) => {
      if (receipt.conversationId === activeConversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.readBy.includes(receipt.userId)
              ? m
              : { ...m, readBy: [...m.readBy, receipt.userId] },
          ),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      queryClient.invalidateQueries({
        queryKey: ['chat-conversation', receipt.conversationId],
      });
    });

    return () => {
      unsubMsg();
      unsubRead();
    };
  }, [activeConversationId, currentUserId, queryClient]);

  // Send or Retry a message with `clientMessageId`
  const dispatchMessage = async (params: {
    text: string;
    clientMessageId: string;
    attachContext?: ConversationContextCard | null;
  }) => {
    if (!activeConversationId) return;

    const optimisticMessage: ChatMessageItem = {
      id: `temp-${params.clientMessageId}`,
      conversationId: activeConversationId,
      senderId: currentUserId,
      clientMessageId: params.clientMessageId,
      text: params.text,
      attachments: [],
      contextCard: params.attachContext || null,
      readBy: [currentUserId],
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        username: user?.profile?.username || 'me',
        fullName: user?.profile?.fullName || user?.email || 'Tôi',
        avatarUrl: user?.profile?.avatarUrl || '',
        isVerified: true,
      },
      deliveryState: 'SENDING',
    };

    setMessages((prev) => mergeMessagesUnique(prev, [optimisticMessage]));
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 30);

    try {
      const result = await socketService.sendMessage({
        conversationId: activeConversationId,
        content: params.text,
        clientMessageId: params.clientMessageId,
        gearId:
          params.attachContext?.type === 'GEAR'
            ? params.attachContext.referenceId
            : undefined,
        bookingId:
          params.attachContext?.type === 'BOOKING'
            ? params.attachContext.referenceId
            : undefined,
      });

      setMessages((prev) =>
        mergeMessagesUnique(prev, [
          {
            ...result.message,
            deliveryState: 'SENT',
          },
        ]),
      );
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    } catch (err: any) {
      const errText =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Gửi thất bại do mất kết nối';
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === params.clientMessageId
            ? {
                ...m,
                deliveryState: 'FAILED',
                errorMessage: errText,
              }
            : m,
        ),
      );
    }
  };

  const handleSubmitSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !activeConversationId) return;

    const clientMessageId = generateClientMessageId();
    const contextToSend =
      attachActiveContext && activeConversation?.activeContext
        ? activeConversation.activeContext
        : null;

    setInputText('');
    setAttachActiveContext(false);

    await dispatchMessage({
      text: trimmed,
      clientMessageId,
      attachContext: contextToSend,
    });
  };

  const handleRetryFailedMessage = async (failedMsg: ChatMessageItem) => {
    const clientMessageId =
      failedMsg.clientMessageId || generateClientMessageId();
    await dispatchMessage({
      text: failedMsg.text,
      clientMessageId,
      attachContext: failedMsg.contextCard,
    });
  };

  const partnerId = activeConversation?.partner?.id || '';
  const partnerLastReadAt =
    partnerId && activeConversation?.readReceipts?.[partnerId]?.lastReadAt
      ? new Date(activeConversation.readReceipts[partnerId].lastReadAt)
      : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-h-[calc(100vh-9.5rem)] flex flex-col md:grid md:grid-cols-12">
      {/* LEFT SIDEBAR: CONVERSATION LIST (Hidden on mobile when a conversation is open) */}
      <div
        className={`md:col-span-4 lg:col-span-4 border-r border-slate-100 flex flex-col ${
          activeConversationId ? 'hidden md:flex' : 'flex flex-1'
        }`}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare size={20} className="text-emerald-600" />
              Tin nhắn trao đổi
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Hội thoại chung giữa chủ thiết bị và người thuê
            </p>
          </div>
          {conversations.length > 0 && (
            <Badge variant="emerald">{conversations.length} hội thoại</Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoadingConversations ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-emerald-600" size={24} />
              <span className="text-xs">Đang tải danh sách hội thoại...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={24} />
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Chưa có cuộc trò chuyện nào
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Nhấn nút <strong>Nhắn tin</strong> trên trang chi tiết thiết bị
                hoặc <strong>Trao đổi về giao dịch</strong> trong đơn thuê để bắt
                đầu trò chuyện.
              </p>
              <Link to="/gear" className="inline-block mt-4">
                <Button size="sm" variant="outline">
                  Khám phá chợ thiết bị
                </Button>
              </Link>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const partner = conv.partner;
              const hasUnread = conv.unreadCount > 0;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => navigate(`/messages/${conv.id}`)}
                  className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                    isSelected
                      ? 'bg-emerald-50/90 border-l-4 border-l-emerald-600'
                      : hasUnread
                        ? 'bg-emerald-50/30 hover:bg-slate-50'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar
                      src={partner?.avatarUrl}
                      alt={partner?.fullName || 'Thành viên'}
                      size="md"
                    />
                    {hasUnread && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate ${
                          hasUnread
                            ? 'font-bold text-slate-900'
                            : 'font-semibold text-slate-800'
                        }`}
                      >
                        {partner?.fullName || 'Thành viên TravelShare'}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    {conv.activeContext && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700 truncate">
                        {conv.activeContext.type === 'BOOKING' ? (
                          <Calendar size={11} className="shrink-0" />
                        ) : (
                          <Package size={11} className="shrink-0" />
                        )}
                        <span className="truncate">
                          {conv.activeContext.title}
                        </span>
                      </div>
                    )}

                    <p
                      className={`text-xs truncate mt-1 ${
                        hasUnread
                          ? 'font-semibold text-slate-900'
                          : 'text-slate-500'
                      }`}
                    >
                      {conv.lastMessagePreview
                        ? `${
                            conv.lastMessageSenderId === currentUserId
                              ? 'Bạn: '
                              : ''
                          }${conv.lastMessagePreview}`
                        : 'Bắt đầu cuộc trò chuyện...'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: ACTIVE CONVERSATION THREAD */}
      <div
        className={`md:col-span-8 lg:col-span-8 flex flex-col h-[calc(100vh-9.5rem)] ${
          activeConversationId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeConversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/40">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center mb-4 shadow-inner">
              <Sparkles size={30} />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              Chọn một hội thoại để bắt đầu nhắn tin
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
              Mọi trao đổi về thiết bị và giao dịch giữa bạn và một thành viên
              được gom chung vào một luồng duy nhất, đồng bộ tức thì qua
              Socket.IO.
            </p>
          </div>
        ) : conversationError || activeConvQueryError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Không thể truy cập cuộc hội thoại
            </h2>
            <p className="text-xs text-slate-500 max-w-md mt-1">
              {conversationError ||
                (activeConvQueryError as any)?.response?.data?.error?.message ||
                'Bạn không phải thành viên của cuộc hội thoại này hoặc hội thoại không tồn tại.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => navigate('/messages')}
            >
              Quay lại danh sách tin nhắn
            </Button>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => navigate('/messages')}
                  className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100"
                  aria-label="Quay lại danh sách"
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar
                  src={activeConversation?.partner?.avatarUrl}
                  alt={activeConversation?.partner?.fullName || 'Đối tác'}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      to={
                        activeConversation?.partner?.username
                          ? `/users/${activeConversation.partner.username}`
                          : '#'
                      }
                      className="font-bold text-sm text-slate-900 hover:text-emerald-600 truncate"
                    >
                      {activeConversation?.partner?.fullName ||
                        (isLoadingActiveConv
                          ? 'Đang tải...'
                          : 'Thành viên TravelShare')}
                    </Link>
                    <ShieldCheck
                      size={15}
                      className="text-emerald-600 shrink-0"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    @{activeConversation?.partner?.username || 'member'} • Kết
                    nối thời gian thực
                  </p>
                </div>
              </div>

              {activeConversation?.partner?.username && (
                <Link
                  to={`/users/${activeConversation.partner.username}`}
                  className="text-xs font-medium text-slate-600 hover:text-emerald-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-200 transition-colors shrink-0"
                >
                  Hồ sơ
                </Link>
              )}
            </div>

            {/* Pinned Context Card (Gear or Booking) */}
            {activeConversation?.activeContext && (
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
                <ContextCardBanner
                  card={activeConversation.activeContext}
                  compact
                />
              </div>
            )}

            {/* Message History Stream */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40"
            >
              {hasMoreOlder && (
                <div className="text-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    disabled={loadingOlderMessages}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 shadow-xs transition-all"
                  >
                    {loadingOlderMessages ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    Tải tin nhắn cũ hơn
                  </button>
                </div>
              )}

              {loadingInitialMessages ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <Loader2
                    size={24}
                    className="animate-spin text-emerald-600"
                  />
                  <span className="text-xs">Đang tải lịch sử tin nhắn...</span>
                </div>
              ) : messages.length === 0 ? (
                <Card className="p-6 text-center max-w-md mx-auto my-8 bg-white/90">
                  <p className="text-sm font-semibold text-slate-800">
                    Bắt đầu trao đổi với{' '}
                    {activeConversation?.partner?.fullName || 'đối tác'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Hãy gửi lời chào, thống nhất thời gian nhận/trả đồ hoặc hỏi
                    thêm chi tiết về tình trạng thiết bị.
                  </p>
                </Card>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === currentUserId;
                  const isReadByPartner =
                    isMine &&
                    ((partnerId && msg.readBy.includes(partnerId)) ||
                      (partnerLastReadAt &&
                        new Date(msg.createdAt) <= partnerLastReadAt));

                  return (
                    <div
                      key={msg.id || msg.clientMessageId}
                      className={`flex flex-col ${
                        isMine ? 'items-end' : 'items-start'
                      }`}
                    >
                      {msg.contextCard && (
                        <div className="max-w-xs sm:max-w-md w-full mb-1.5">
                          <ContextCardBanner card={msg.contextCard} compact />
                        </div>
                      )}

                      <div
                        className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                          isMine
                            ? msg.deliveryState === 'FAILED'
                              ? 'bg-rose-600 text-white rounded-br-xs'
                              : 'bg-emerald-600 text-white rounded-br-xs'
                            : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </p>
                      </div>

                      {/* Delivery & Read Status Footer */}
                      <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                        <span>{formatRelativeTime(msg.createdAt)}</span>

                        {isMine && (
                          <>
                            {msg.deliveryState === 'SENDING' && (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                <Clock size={11} />
                                Đang gửi...
                              </span>
                            )}

                            {msg.deliveryState === 'SENT' &&
                              (isReadByPartner ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                                  <CheckCheck size={13} />
                                  Đã xem
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-slate-500">
                                  <Check size={12} />
                                  Đã gửi
                                </span>
                              ))}

                            {msg.deliveryState === 'FAILED' && (
                              <div className="inline-flex items-center gap-2 text-rose-600 font-semibold">
                                <span className="inline-flex items-center gap-1">
                                  <AlertCircle size={12} />
                                  Gửi thất bại
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRetryFailedMessage(msg)}
                                  className="underline hover:text-rose-700 inline-flex items-center gap-1"
                                >
                                  <RefreshCw size={11} />
                                  Gửi lại
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            <form
              onSubmit={handleSubmitSend}
              className="p-3 bg-white border-t border-slate-100 space-y-2"
            >
              {activeConversation?.activeContext && (
                <div className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-slate-50 text-slate-600">
                  <label className="flex items-center gap-2 cursor-pointer select-none truncate">
                    <input
                      type="checkbox"
                      checked={attachActiveContext}
                      onChange={(e) => setAttachActiveContext(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="truncate">
                      Đính kèm thẻ ngữ cảnh:{' '}
                      <strong>{activeConversation.activeContext.title}</strong>
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập tin nhắn trao đổi về thiết bị hoặc lịch nhận/trả đồ..."
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <Button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="rounded-xl px-4 py-2.5 flex items-center gap-1.5"
                >
                  <Send size={16} />
                  <span className="hidden sm:inline">Gửi</span>
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
