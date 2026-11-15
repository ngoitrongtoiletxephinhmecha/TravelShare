import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Backpack,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Compass,
  DollarSign,
  ExternalLink,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Minus,
  Mountain,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import {
  aiService,
  createDefaultTripState,
} from '../services/ai.service';
import {
  ChecklistDetailDto,
  ChecklistMatchResultDto,
  checklistService,
} from '../services/checklist.service';
import { useAuthStore } from '../store/auth.store';
import {
  AiConversationItem,
  AiConversationStatus,
  AiMessageItem,
  ChecklistPreviewItem,
  ValidatedTripState,
} from '../types';
import { Badge, Button, Card } from '../components/ui/DesignSystem';
import { formatRelativeTime, formatVnd } from '../utils/format';

function generateAiClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ai-cmsg-${crypto.randomUUID()}`;
  }
  return `ai-cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  TREKKING: 'Trekking / Leo núi',
  CAMPING: 'Cắm trại (Camping)',
  MOTORBIKE_TOUR: 'Phượt xe máy',
  BACKPACKING: 'Du lịch bụi (Backpacking)',
  MOUNTAINEERING: 'Leo núi mạo hiểm',
  BEACH_CAMPING: 'Cắm trại biển',
  OTHER: 'Dã ngoại ngoài trời',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  BEGINNER: 'Người mới (Beginner)',
  INTERMEDIATE: 'Đã có kinh nghiệm (Intermediate)',
  ADVANCED: 'Chuyên nghiệp (Advanced)',
};

const MISSING_FIELD_LABELS: Record<string, string> = {
  destination: 'Địa điểm chuyến đi',
  activity: 'Hoạt động chính',
  durationDays: 'Số ngày đi',
  travelers: 'Số người tham gia',
  departureDate: 'Ngày khởi hành',
  pickupArea: 'Khu vực nhận đồ thuê',
};

const GEAR_CODE_LABELS: Record<string, string> = {
  TENT: 'Lều trại',
  BACKPACK: 'Balo',
  SLEEPING_BAG: 'Túi ngủ',
  TREKKING_SHOES: 'Giày trekking',
  TREKKING_POLES: 'Gậy trekking',
  RAIN_JACKET: 'Áo khoác / Áo mưa',
  HEADLAMP: 'Đèn đội đầu',
  CAMPING_STOVE: 'Bếp dã ngoại',
  CAMPING_CHAIR: 'Bàn ghế camping',
  CAMERA: 'Máy ảnh',
};

const QUICK_PROMPTS = [
  'Tôi muốn trekking Yên Tử',
  'Đi một ngày, nhóm ba người',
  'Thực ra nhóm có bốn người',
  'Mình đã có balo và áo khoác, ngân sách thuê 300.000 đồng',
];

export const AiAssistantPage: React.FC = () => {
  const { id: routeConversationId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const [messages, setMessages] = useState<AiMessageItem[]>([]);
  const [tripState, setTripState] = useState<ValidatedTripState>(
    createDefaultTripState(),
  );
  const [status, setStatus] = useState<AiConversationStatus>(
    'NEEDS_INFORMATION',
  );
  const [missingFields, setMissingFields] = useState<string[]>([
    'destination',
    'activity',
    'durationDays',
    'travelers',
  ]);
  const [checklistPreview, setChecklistPreview] = useState<
    ChecklistPreviewItem[]
  >([]);
  const [travelPlanId, setTravelPlanId] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingConv, setCreatingConv] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [turnError, setTurnError] = useState<{
    message: string;
    failedMessage: AiMessageItem;
  } | null>(null);

  // =========================================================================
  // PHASE 7 STATE: CHECKLIST & GEAR MATCHING
  // =========================================================================
  const [activeChecklist, setActiveChecklist] =
    useState<ChecklistDetailDto | null>(null);
  const [creatingChecklist, setCreatingChecklist] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // Local draft inputs for quantityOwned & shoe size per item
  const [ownedDrafts, setOwnedDrafts] = useState<Record<string, string>>({});
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, string>>({});

  // Matching Filter Form State
  const [matchStartAt, setMatchStartAt] = useState('2026-12-10');
  const [matchEndAt, setMatchEndAt] = useState('2026-12-12');
  const [matchPickupArea, setMatchPickupArea] = useState('Đống Đa, Hà Nội');
  const [matchBudgetInput, setMatchBudgetInput] = useState('');
  const [matchSharingType, setMatchSharingType] = useState<
    '' | 'RENT' | 'FREE_LOAN' | 'BOTH'
  >('');
  const [matchingGear, setMatchingGear] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchResult, setMatchResult] =
    useState<ChecklistMatchResultDto | null>(null);
  const [isMatchStale, setIsMatchStale] = useState(false);

  const latestChecklistVersionRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const checklistSectionRef = useRef<HTMLDivElement | null>(null);

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => aiService.listConversations(),
    enabled: isAuthenticated,
  });

  // Automatically select first conversation if none in URL and conversations exist
  const activeConversationId = useMemo(() => {
    if (routeConversationId) return routeConversationId;
    return conversations[0]?.id || null;
  }, [routeConversationId, conversations]);

  const activeConversation: AiConversationItem | null = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      conversations.find((c) => c.id === activeConversationId) || null
    );
  }, [activeConversationId, conversations]);

  const syncDraftsFromChecklist = (cl: ChecklistDetailDto) => {
    const nextOwned: Record<string, string> = {};
    const nextSizes: Record<string, string> = {};
    for (const item of cl.items || []) {
      nextOwned[item.itemId] = String(item.quantityOwned ?? 0);
      const reqSize =
        item.requiredAttributes?.size ?? item.requiredAttributes?.sizeEu ?? '';
      nextSizes[item.itemId] = reqSize !== undefined ? String(reqSize) : '';
    }
    setOwnedDrafts(nextOwned);
    setSizeDrafts(nextSizes);
    latestChecklistVersionRef.current = cl.checklistVersion || 1;
  };

  // Load messages, tripState, and saved Checklist whenever activeConversationId changes
  useEffect(() => {
    if (!isAuthenticated || !activeConversationId) {
      setMessages([]);
      setTripState(createDefaultTripState());
      setStatus('NEEDS_INFORMATION');
      setMissingFields([
        'destination',
        'activity',
        'durationDays',
        'travelers',
      ]);
      setChecklistPreview([]);
      setTravelPlanId(null);
      setChecklistId(null);
      setActiveChecklist(null);
      setMatchResult(null);
      setAccessError(null);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setAccessError(null);
    setTurnError(null);
    setChecklistError(null);
    setMatchError(null);
    setMatchResult(null);
    setIsMatchStale(false);

    (async () => {
      try {
        const res = await aiService.getMessages(activeConversationId, {
          limit: 40,
        });
        if (cancelled) return;

        const conv = res.conversation;
        setMessages(res.items);
        setNextCursor(res.nextCursor);
        setHasMoreOlder(res.hasMore);
        setTripState(conv.tripState);
        setStatus(conv.status);
        setMissingFields(conv.missingFields);
        setChecklistPreview(conv.checklistPreview || []);
        setTravelPlanId(conv.travelPlanId || null);
        setChecklistId(conv.checklistId || null);

        // Pre-fill matching filter defaults from tripState if available
        if (conv.tripState?.departureDate) {
          setMatchStartAt(conv.tripState.departureDate);
          if (conv.tripState.endDate) {
            setMatchEndAt(conv.tripState.endDate);
          }
        }
        if (conv.tripState?.pickupArea) {
          setMatchPickupArea(conv.tripState.pickupArea);
        }
        if (
          conv.tripState?.budgetVnd !== null &&
          conv.tripState?.budgetVnd !== undefined
        ) {
          setMatchBudgetInput(String(conv.tripState.budgetVnd));
        }

        // Load persisted Checklist if checklistId exists
        if (conv.checklistId) {
          try {
            const loadedCl = await checklistService.getChecklistById(
              conv.checklistId,
            );
            if (!cancelled) {
              setActiveChecklist(loadedCl);
              syncDraftsFromChecklist(loadedCl);
            }
          } catch {
            // ignore if not yet created
          }
        } else {
          setActiveChecklist(null);
        }

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          'Không thể tải cuộc hội thoại AI này.';
        setAccessError(msg);
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, isAuthenticated]);

  const handleCreateNewConversation = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setCreatingConv(true);
    setAccessError(null);
    setTurnError(null);
    try {
      const created = await aiService.createConversation({});
      await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      navigate(`/ai-assistant/${created.id}`);
    } catch (err: any) {
      setAccessError(
        err?.response?.data?.error?.message ||
          'Không thể khởi tạo cuộc hội thoại mới.',
      );
    } finally {
      setCreatingConv(false);
    }
  };

  const handleLoadOlderMessages = async () => {
    if (!activeConversationId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await aiService.getMessages(activeConversationId, {
        beforeId: nextCursor,
        limit: 30,
      });
      setMessages((prev) => [...res.items, ...prev]);
      setNextCursor(res.nextCursor);
      setHasMoreOlder(res.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  const dispatchTurn = async (text: string, clientMessageId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setSending(true);
    setTurnError(null);

    let targetConvId = activeConversationId;

    try {
      if (!targetConvId) {
        const created = await aiService.createConversation({});
        targetConvId = created.id;
        await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
        navigate(`/ai-assistant/${targetConvId}`, { replace: true });
      }

      const optimisticUserMsg: AiMessageItem = {
        id: `temp-${clientMessageId}`,
        aiConversationId: targetConvId,
        conversationId: targetConvId,
        role: 'user',
        content: text,
        clientMessageId,
        createdAt: new Date().toISOString(),
        deliveryState: 'SENDING',
      };

      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => m.clientMessageId !== clientMessageId,
        );
        return [...filtered, optimisticUserMsg];
      });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 30);

      const turnRes = await aiService.sendMessage(targetConvId, {
        content: text,
        clientMessageId,
      });

      setMessages((prev) => {
        const withoutTemp = prev.filter(
          (m) =>
            m.clientMessageId !== clientMessageId &&
            m.id !== turnRes.userMessage.id &&
            m.id !== turnRes.assistantMessage?.id,
        );
        const nextList = [
          ...withoutTemp,
          { ...turnRes.userMessage, deliveryState: 'SENT' as const },
        ];
        if (turnRes.assistantMessage) {
          nextList.push({
            ...turnRes.assistantMessage,
            deliveryState: 'SENT' as const,
          });
        }
        return nextList;
      });

      setTripState(turnRes.tripState);
      setStatus(turnRes.status);
      setMissingFields(turnRes.missingFields);
      setChecklistPreview(turnRes.checklistPreview || []);

      const nextPlanId = turnRes.conversation?.travelPlanId || travelPlanId;
      const nextClId = turnRes.conversation?.checklistId || checklistId;
      setTravelPlanId(nextPlanId || null);
      setChecklistId(nextClId || null);

      if (turnRes.tripState?.departureDate) {
        setMatchStartAt(turnRes.tripState.departureDate);
        if (turnRes.tripState.endDate) {
          setMatchEndAt(turnRes.tripState.endDate);
        }
      }
      if (turnRes.tripState?.pickupArea) {
        setMatchPickupArea(turnRes.tripState.pickupArea);
      }
      if (
        turnRes.tripState?.budgetVnd !== null &&
        turnRes.tripState?.budgetVnd !== undefined
      ) {
        setMatchBudgetInput(String(turnRes.tripState.budgetVnd));
      }

      // Immediately apply turnRes.checklistPreview to activeChecklist so chat updates reflect with zero delay
      if (Array.isArray(turnRes.checklistPreview) && activeChecklist) {
        const previewCl: ChecklistDetailDto = {
          ...activeChecklist,
          items: turnRes.checklistPreview as any,
        };
        setActiveChecklist(previewCl);
        syncDraftsFromChecklist(previewCl);
        if (matchResult) {
          setIsMatchStale(true);
        }
      }

      // If a checklist already exists, refresh full checklist detail (summary, versions, travelPlan)
      if (nextClId) {
        try {
          const refreshedCl = await checklistService.getChecklistById(nextClId);
          setActiveChecklist(refreshedCl);
          syncDraftsFromChecklist(refreshedCl);
          if (matchResult) {
            setIsMatchStale(true);
          }
        } catch {
          // ignore
        }
      }

      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err: any) {
      const errData = err?.response?.data?.error || err?.response?.data || {};
      const errText =
        errData.message ||
        err?.message ||
        'Không thể kết nối tới Trợ lý AI. Thông tin chuyến đi trước đó vẫn được giữ nguyên.';

      if (errData.tripState) {
        setTripState(errData.tripState);
      }

      const failedMsg: AiMessageItem = {
        id: `failed-${clientMessageId}`,
        aiConversationId: targetConvId || '',
        conversationId: targetConvId || '',
        role: 'user',
        content: text,
        clientMessageId,
        createdAt: new Date().toISOString(),
        deliveryState: 'FAILED',
        errorMessage: errText,
      };

      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId ? failedMsg : m,
        ),
      );
      setTurnError({ message: errText, failedMessage: failedMsg });
    } finally {
      setSending(false);
    }
  };

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    const clientMessageId = generateAiClientMessageId();
    setInputText('');
    await dispatchTurn(trimmed, clientMessageId);
  };

  const handleQuickPromptClick = async (promptText: string) => {
    if (sending) return;
    const clientMessageId = generateAiClientMessageId();
    await dispatchTurn(promptText, clientMessageId);
  };

  const handleRetryFailedTurn = async (failedMsg: AiMessageItem) => {
    if (sending) return;
    const sameClientMessageId =
      failedMsg.clientMessageId || generateAiClientMessageId();
    await dispatchTurn(failedMsg.content, sameClientMessageId);
  };

  // =========================================================================
  // PHASE 7 HANDLERS: CREATE CHECKLIST, UPDATE ITEMS & MATCH MISSING GEAR
  // =========================================================================

  const handleCreateOrSyncChecklist = async () => {
    if (!travelPlanId) return;
    setCreatingChecklist(true);
    setChecklistError(null);
    try {
      const cl = await checklistService.createOrGetChecklistForPlan(
        travelPlanId,
      );
      setActiveChecklist(cl);
      setChecklistId(cl.id);
      syncDraftsFromChecklist(cl);
      setTimeout(() => {
        checklistSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Không thể tạo hoặc đồng bộ Checklist.';
      setChecklistError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setCreatingChecklist(false);
    }
  };

  const handleSaveItemUpdate = async (
    itemId: string,
    payload: {
      quantityOwned?: number;
      ownedConfirmed?: boolean;
      requiredAttributes?: Record<string, any>;
    },
  ) => {
    if (!activeChecklist) return;
    setUpdatingItemId(itemId);
    setChecklistError(null);
    try {
      const updated = await checklistService.updateChecklistItem(
        activeChecklist.id,
        itemId,
        payload,
      );
      setActiveChecklist(updated);
      syncDraftsFromChecklist(updated);
      if (matchResult) {
        setIsMatchStale(true);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Không thể cập nhật số lượng đồ đã có.';
      setChecklistError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMatchMissingGear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChecklist) return;

    setMatchError(null);
    setMatchingGear(true);
    const versionAtRequestStart = latestChecklistVersionRef.current;

    try {
      let parsedBudget: number | null | undefined = undefined;
      if (matchBudgetInput.trim() !== '') {
        const num = Number(matchBudgetInput.replace(/[.,\s]/g, ''));
        if (isNaN(num) || num < 0) {
          setMatchError('Ngân sách dự kiến phải là số không âm (>= 0).');
          setMatchingGear(false);
          return;
        }
        parsedBudget = num;
      }

      const res = await checklistService.matchMissingGear(activeChecklist.id, {
        startAt: matchStartAt,
        endAt: matchEndAt,
        pickupArea: matchPickupArea.trim() || undefined,
        budgetVnd: parsedBudget,
        sharingType: matchSharingType || undefined,
        expectedChecklistVersion: versionAtRequestStart,
      });

      // Ignore stale response if the user edited the checklist while the request was in flight
      if (res.checklistVersion < latestChecklistVersionRef.current) {
        setIsMatchStale(true);
        return;
      }

      setMatchResult(res);
      setIsMatchStale(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Không thể tìm thiết bị phù hợp. Vui lòng kiểm tra lại khoảng ngày (startAt < endAt).';
      setMatchError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setMatchingGear(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card className="p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-stone-900">
            Trợ lý AI Tư vấn Chuyến đi & Thiết bị
          </h1>
          <p className="text-sm text-stone-600 max-w-md mx-auto">
            Vui lòng đăng nhập để bắt đầu cuộc hội thoại nhiều lượt với Trợ lý
            AI, lưu lịch sử tư vấn và tự động lập Checklist thiết bị cá nhân
            hóa.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/login">
              <Button variant="primary">Đăng nhập ngay</Button>
            </Link>
            <Link to="/register">
              <Button variant="outline">Tạo tài khoản</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: AI CONVERSATION LIST (3 cols) */}
        <Card className="lg:col-span-3 overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
          <div className="p-4 border-b border-stone-100 bg-stone-50/70 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                Lịch sử tư vấn AI
              </h2>
              <p className="text-[11px] text-stone-500">
                Riêng tư theo tài khoản của bạn
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              isLoading={creatingConv}
              onClick={handleCreateNewConversation}
              title="Tạo cuộc hội thoại mới"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Mới</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
            {isLoadingConversations ? (
              <div className="p-6 text-center text-stone-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                <span>Đang tải hội thoại...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs font-semibold text-stone-700">
                  Chưa có cuộc hội thoại nào
                </p>
                <p className="text-[11px] text-stone-500">
                  Hãy chọn một gợi ý bên phải hoặc nhập câu hỏi đầu tiên để bắt
                  đầu lập kế hoạch chuyến đi.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === activeConversationId;
                const isReady = conv.status === 'READY_FOR_CHECKLIST';
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => navigate(`/ai-assistant/${conv.id}`)}
                    className={`w-full text-left p-3.5 transition-colors block space-y-1.5 ${
                      isSelected
                        ? 'bg-emerald-50/90 border-l-4 border-l-emerald-700'
                        : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-stone-900 truncate">
                        {conv.title}
                      </span>
                      <Badge variant={isReady ? 'emerald' : 'amber'}>
                        {isReady ? 'Đủ thông tin' : 'Đang hỏi'}
                      </Badge>
                    </div>

                    {conv.tripState?.destination && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                        <span>📍 {conv.tripState.destination}</span>
                        {conv.tripState.durationDays && (
                          <span>• {conv.tripState.durationDays} ngày</span>
                        )}
                        {conv.tripState.travelers && (
                          <span>• {conv.tripState.travelers} người</span>
                        )}
                      </div>
                    )}

                    {conv.lastMessageAt && (
                      <p className="text-[10px] text-stone-400">
                        {formatRelativeTime(conv.lastMessageAt)}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* COLUMN 2: CHAT STREAM & INPUT (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col h-[calc(100vh-7rem)] overflow-hidden">
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-stone-100 bg-emerald-900 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-200" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold truncate">
                  {activeConversation?.title ||
                    'AI Travel Assistant — Tư vấn Chuyến đi'}
                </h1>
                <p className="text-[11px] text-emerald-200 truncate">
                  Trích xuất yêu cầu đa lượt • Lưu ngữ cảnh & Checklist tự động
                </p>
              </div>
            </div>

            <Badge
              variant={status === 'READY_FOR_CHECKLIST' ? 'emerald' : 'amber'}
            >
              {status === 'READY_FOR_CHECKLIST'
                ? 'READY_FOR_CHECKLIST'
                : 'NEEDS_INFORMATION'}
            </Badge>
          </div>

          {/* Access Error Banner */}
          {accessError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-900">
                Từ chối truy cập hội thoại
              </h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                {accessError}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={handleCreateNewConversation}
              >
                Tạo cuộc hội thoại của riêng bạn
              </Button>
            </div>
          ) : (
            <>
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/50">
                {hasMoreOlder && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleLoadOlderMessages}
                      disabled={loadingOlder}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white border border-stone-200 text-stone-600 hover:text-emerald-700"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${loadingOlder ? 'animate-spin' : ''}`}
                      />
                      Tải tin nhắn trước đó
                    </button>
                  </div>
                )}

                {loadingMessages ? (
                  <div className="py-12 text-center text-stone-400 text-xs flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
                    <span>Đang tải lịch sử hội thoại AI...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="space-y-4 my-4">
                    <div className="p-4 rounded-2xl bg-white border border-stone-200/80 shadow-xs space-y-2">
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        Xin chào! Mình là Trợ lý AI TravelShare
                      </p>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Hãy cho mình biết địa điểm, hoạt động, số ngày hoặc số
                        người trong nhóm của bạn. Bạn có thể bổ sung hoặc chỉnh
                        sửa thông tin qua từng câu trả lời tự nhiên!
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-stone-500 px-1">
                        Gợi ý bắt đầu nhanh (nhấn để gửi):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_PROMPTS.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleQuickPromptClick(q)}
                            disabled={sending}
                            className="text-left text-xs px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-50 transition-colors shadow-2xs"
                          >
                            “{q}”
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id || msg.clientMessageId}
                        className={`flex flex-col ${
                          isUser ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                            isUser
                              ? msg.deliveryState === 'FAILED'
                                ? 'bg-red-600 text-white rounded-br-xs'
                                : 'bg-emerald-800 text-white rounded-br-xs'
                              : 'bg-white text-stone-800 border border-stone-200/80 rounded-bl-xs'
                          }`}
                        >
                          <div className="whitespace-pre-line break-words">
                            {msg.content}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-stone-400">
                          <span>
                            {isUser ? 'Bạn' : 'Trợ lý AI'} •{' '}
                            {formatRelativeTime(msg.createdAt)}
                          </span>

                          {isUser && msg.deliveryState === 'SENDING' && (
                            <span className="text-amber-600 font-medium">
                              • Đang xử lý...
                            </span>
                          )}

                          {isUser && msg.deliveryState === 'FAILED' && (
                            <button
                              type="button"
                              onClick={() => handleRetryFailedTurn(msg)}
                              className="text-red-600 font-bold underline inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Gửi lại lượt này
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {sending && (
                  <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/90 border border-emerald-200 px-3.5 py-2.5 rounded-2xl w-fit">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>
                      Trợ lý AI đang trích xuất yêu cầu và cập nhật thông tin
                      chuyến đi...
                    </span>
                  </div>
                )}

                {turnError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{turnError.message}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleRetryFailedTurn(turnError.failedMessage)
                      }
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Thử lại
                    </Button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Follow-up Chips */}
              {messages.length > 0 && (
                <div className="px-3 py-2 bg-stone-50 border-t border-stone-100 flex items-center gap-1.5 overflow-x-auto">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={sending}
                      onClick={() => handleQuickPromptClick(q)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 shrink-0 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Form */}
              <form
                onSubmit={handleSendSubmit}
                className="p-3 bg-white border-t border-stone-200/80 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={sending}
                  placeholder="Nhập thông tin chuyến đi (VD: Tôi muốn trekking Yên Tử, Đi một ngày nhóm ba người...)"
                  className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-600"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!inputText.trim() || sending}
                  isLoading={sending}
                >
                  <Send className="w-4 h-4" />
                  <span>Gửi</span>
                </Button>
              </form>
            </>
          )}
        </Card>

        {/* COLUMN 3: LIVE TRIP INFORMATION CARD & CHECKLIST ACTION (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-700" />
                <div>
                  <h2 className="text-sm font-bold text-stone-900">
                    Thông tin chuyến đi
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    Cập nhật tự động sau mỗi lượt hội thoại
                  </p>
                </div>
              </div>

              <Badge
                variant={status === 'READY_FOR_CHECKLIST' ? 'emerald' : 'amber'}
              >
                {status === 'READY_FOR_CHECKLIST'
                  ? 'Đã đủ thông tin'
                  : 'Cần bổ sung'}
              </Badge>
            </div>

            {/* Structured Trip State Fields */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-700" />
                  Địa điểm
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.destination || (
                    <span className="text-stone-400 font-normal italic">
                      Chưa xác định
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <Mountain className="w-3 h-3 text-emerald-700" />
                  Hoạt động
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.activity ? (
                    ACTIVITY_LABELS[tripState.activity] || tripState.activity
                  ) : (
                    <span className="text-stone-400 font-normal italic">
                      Chưa xác định
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-700" />
                  Thời lượng
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.durationDays ? (
                    `${tripState.durationDays} ngày`
                  ) : (
                    <span className="text-stone-400 font-normal italic">
                      Chưa xác định
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <Users className="w-3 h-3 text-emerald-700" />
                  Số người
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.travelers ? (
                    `${tripState.travelers} người`
                  ) : (
                    <span className="text-stone-400 font-normal italic">
                      Chưa xác định
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-700" />
                  Ngày khởi hành
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.departureDate || (
                    <span className="text-stone-400 font-normal italic">
                      Tùy chọn
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                <span className="text-[10px] font-semibold uppercase text-stone-400 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-emerald-700" />
                  Ngân sách thuê
                </span>
                <p className="font-bold text-stone-900 mt-1">
                  {tripState.budgetVnd !== null &&
                  tripState.budgetVnd !== undefined ? (
                    formatVnd(tripState.budgetVnd)
                  ) : (
                    <span className="text-stone-400 font-normal italic">
                      Chưa đặt
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Optional extra details: Route, Experience, Pickup Area, Owned Gear */}
            <div className="space-y-2 text-xs pt-1">
              {tripState.route && (
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500 inline-flex items-center gap-1">
                    <RouteIcon className="w-3.5 h-3.5 text-emerald-700" />
                    Tuyến đường:
                  </span>
                  <span className="font-semibold text-stone-900">
                    {tripState.route}
                  </span>
                </div>
              )}

              {tripState.experienceLevel && (
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Kinh nghiệm:</span>
                  <span className="font-semibold text-stone-900">
                    {EXPERIENCE_LABELS[tripState.experienceLevel] ||
                      tripState.experienceLevel}
                  </span>
                </div>
              )}

              {tripState.pickupArea && (
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Khu vực nhận đồ:</span>
                  <span className="font-semibold text-stone-900">
                    {tripState.pickupArea}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-stone-600 flex items-center gap-1">
                  <Backpack className="w-3.5 h-3.5 text-emerald-700" />
                  Thiết bị đã có sẵn ({tripState.ownedGear.length}):
                </span>
                {tripState.ownedGear.length === 0 ? (
                  <p className="text-[11px] text-stone-400 italic">
                    Chưa khai báo thiết bị cá nhân đã có
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tripState.ownedGear.map((code) => (
                      <Badge key={code} variant="emerald">
                        {GEAR_CODE_LABELS[code] || code}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Missing Fields Indicator OR Create Checklist Button */}
            {missingFields.length > 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 space-y-1.5">
                <p className="text-xs font-bold text-amber-900">
                  Thông tin cần bổ sung để tạo Checklist:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingFields.map((field) => (
                    <Badge key={field} variant="amber">
                      {MISSING_FIELD_LABELS[field] || field}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Trạng thái <strong>READY_FOR_CHECKLIST</strong> — Đã đủ
                    thông tin hoạt động, số ngày và số người!
                  </span>
                </div>

                {travelPlanId && (
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full"
                    isLoading={creatingChecklist}
                    onClick={handleCreateOrSyncChecklist}
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>
                      {activeChecklist
                        ? 'Tạo checklist / Đồng bộ Checklist'
                        : 'Tạo checklist'}
                    </span>
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Compact Checklist Summary Card */}
          {checklistPreview.length > 0 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-emerald-700" />
                  Bản xem trước ({checklistPreview.length} hạng mục)
                </h3>
                <Badge variant="emerald">{tripState.travelers} người</Badge>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(activeChecklist?.items || checklistPreview).map(
                  (item: any) => {
                    const reqQty =
                      item.quantityRequired ?? item.quantityNeeded ?? 1;
                    return (
                      <div
                        key={item.itemId || item.categoryCode}
                        className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold text-stone-900 truncate">
                          {item.name}
                        </span>
                        <Badge
                          variant={
                            item.quantityMissing > 0 ? 'amber' : 'emerald'
                          }
                        >
                          {item.quantityMissing > 0
                            ? `Thiếu ${item.quantityMissing}/${reqQty}`
                            : `Đủ ${reqQty}`}
                        </Badge>
                      </div>
                    );
                  },
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* =====================================================================
          PHASE 7 WORKSPACE: INTERACTIVE CHECKLIST & MISSING GEAR MATCHING
      ===================================================================== */}
      {activeChecklist && (
        <div ref={checklistSectionRef} className="space-y-6 pt-2">
          <Card className="p-5 sm:p-6 space-y-5 border-2 border-emerald-700/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="emerald">
                    Phiên bản Checklist v{activeChecklist.checklistVersion}
                  </Badge>
                  <Badge variant="stone">
                    Kế hoạch v{activeChecklist.planVersion}
                  </Badge>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-stone-900 mt-1 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-700" />
                  {activeChecklist.title}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Nhập số lượng đồ nhóm bạn đã có sẵn và kích cỡ yêu cầu (như
                  size giày) để hệ thống tính chính xác số lượng còn thiếu.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-3 py-2 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-500">Hạng mục cần thuê thêm: </span>
                  <strong className="text-amber-700">
                    {
                      activeChecklist.items.filter(
                        (i) => i.canRent && i.quantityMissing > 0,
                      ).length
                    }{' '}
                    mục
                  </strong>
                </div>
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-emerald-800">Tổng số món thiếu: </span>
                  <strong className="text-emerald-950">
                    {activeChecklist.items
                      .filter((i) => i.canRent)
                      .reduce((sum, i) => sum + i.quantityMissing, 0)}{' '}
                    món
                  </strong>
                </div>
              </div>
            </div>

            {checklistError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checklistError}</span>
              </div>
            )}

            {/* Checklist Items Table / Cards */}
            <div className="space-y-3">
              {activeChecklist.items.map((item) => {
                const isShoeOrSized =
                  item.categoryCode === 'TREKKING_SHOES' ||
                  item.categoryCode === 'RAIN_JACKET';
                const draftOwnedStr =
                  ownedDrafts[item.itemId] ?? String(item.quantityOwned);
                const draftSizeStr =
                  sizeDrafts[item.itemId] ??
                  String(
                    item.requiredAttributes?.size ??
                      item.requiredAttributes?.sizeEu ??
                      '',
                  );
                const isSaving = updatingItemId === item.itemId;

                return (
                  <div
                    key={item.itemId}
                    className={`p-4 rounded-2xl border transition-colors ${
                      !item.canRent
                        ? 'bg-stone-50/70 border-stone-200/80'
                        : item.quantityMissing > 0
                          ? 'bg-white border-amber-300/90 shadow-2xs'
                          : 'bg-emerald-50/30 border-emerald-200'
                    }`}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                      {/* Item Info (5 cols) */}
                      <div className="lg:col-span-5 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold text-stone-900">
                            {item.name}
                          </span>
                          <Badge
                            variant={
                              item.priority === 'ESSENTIAL'
                                ? 'emerald'
                                : 'stone'
                            }
                          >
                            {item.priority === 'ESSENTIAL'
                              ? 'Thiết yếu'
                              : 'Khuyên dùng'}
                          </Badge>
                          {item.canRent ? (
                            <Badge variant="emerald">Có thể thuê/mượn</Badge>
                          ) : (
                            <Badge variant="stone">
                              Tự chuẩn bị (Không cho thuê)
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-500">{item.reason}</p>

                        {!item.ownedConfirmed && (
                          <div className="inline-flex items-center gap-2 mt-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Bạn đã đề cập có sẵn đồ này trong hội thoại — vui
                              lòng xác nhận số lượng thực tế:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveItemUpdate(item.itemId, {
                                  quantityOwned: Number(draftOwnedStr) || 0,
                                  ownedConfirmed: true,
                                })
                              }
                              className="font-bold text-emerald-800 underline"
                            >
                              Xác nhận ({draftOwnedStr} {item.unit})
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Quantities & Required Attributes (7 cols) */}
                      <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center text-xs">
                        {/* Column 1: Quantity Required */}
                        <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/70 text-center">
                          <p className="text-[10px] font-semibold uppercase text-stone-400">
                            Cần chuẩn bị
                          </p>
                          <p className="text-sm font-bold text-stone-900 mt-0.5">
                            {item.quantityRequired} {item.unit}
                          </p>
                        </div>

                        {/* Column 2: Quantity Owned Input */}
                        <div className="p-2 rounded-xl bg-white border border-stone-300 space-y-1">
                          <label className="block text-[10px] font-semibold uppercase text-stone-500 text-center">
                            Đã có ({item.unit})
                          </label>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={isSaving || Number(draftOwnedStr) <= 0}
                              onClick={() => {
                                const nextVal = Math.max(
                                  0,
                                  (Number(draftOwnedStr) || 0) - 1,
                                );
                                setOwnedDrafts((prev) => ({
                                  ...prev,
                                  [item.itemId]: String(nextVal),
                                }));
                                handleSaveItemUpdate(item.itemId, {
                                  quantityOwned: nextVal,
                                  ownedConfirmed: true,
                                });
                              }}
                              className="w-6 h-6 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                              title="Giảm số lượng đã có"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draftOwnedStr}
                              onChange={(e) =>
                                setOwnedDrafts((prev) => ({
                                  ...prev,
                                  [item.itemId]: e.target.value,
                                }))
                              }
                              onBlur={() => {
                                const parsed = Number(draftOwnedStr);
                                if (
                                  !Number.isInteger(parsed) ||
                                  parsed < 0 ||
                                  draftOwnedStr.trim() === ''
                                ) {
                                  setChecklistError(
                                    'Số lượng đã có phải là số nguyên không âm (>= 0).',
                                  );
                                  setOwnedDrafts((prev) => ({
                                    ...prev,
                                    [item.itemId]: String(item.quantityOwned),
                                  }));
                                  return;
                                }
                                if (parsed !== item.quantityOwned) {
                                  handleSaveItemUpdate(item.itemId, {
                                    quantityOwned: parsed,
                                    ownedConfirmed: true,
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-12 text-center font-bold text-stone-900 text-xs py-1 rounded border border-stone-200"
                            />

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => {
                                const nextVal =
                                  Math.max(0, Number(draftOwnedStr) || 0) + 1;
                                setOwnedDrafts((prev) => ({
                                  ...prev,
                                  [item.itemId]: String(nextVal),
                                }));
                                handleSaveItemUpdate(item.itemId, {
                                  quantityOwned: nextVal,
                                  ownedConfirmed: true,
                                });
                              }}
                              className="w-6 h-6 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                              title="Tăng số lượng đã có"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Column 3: Quantity Missing */}
                        <div
                          className={`p-2.5 rounded-xl border text-center ${
                            item.quantityMissing > 0
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <p className="text-[10px] font-semibold uppercase">
                            Còn thiếu
                          </p>
                          <p className="text-sm font-bold mt-0.5">
                            {item.quantityMissing} {item.unit}
                          </p>
                        </div>

                        {/* Column 4: Size / Attribute or Status */}
                        <div>
                          {isShoeOrSized && item.canRent ? (
                            <div className="p-2 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
                              <label className="block text-[10px] font-semibold text-stone-500">
                                Size yêu cầu (VD: 41)
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={draftSizeStr}
                                  placeholder="Tất cả size"
                                  onChange={(e) =>
                                    setSizeDrafts((prev) => ({
                                      ...prev,
                                      [item.itemId]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => {
                                    const currentSaved = String(
                                      item.requiredAttributes?.size ?? '',
                                    );
                                    if (draftSizeStr.trim() !== currentSaved) {
                                      handleSaveItemUpdate(item.itemId, {
                                        requiredAttributes: {
                                          size: draftSizeStr.trim() || null,
                                        },
                                      });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded border border-stone-300 bg-white"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-[11px] text-stone-500 px-2">
                              {isSaving ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Đang lưu...
                                </span>
                              ) : (
                                <span>{item.note}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ===============================================================
                MISSING GEAR MATCHING FILTER FORM
            =============================================================== */}
            <form
              onSubmit={handleMatchMissingGear}
              className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-emerald-700" />
                    Tìm thiết bị còn thiếu trên Chợ Thiết Bị TravelShare
                  </h3>
                  <p className="text-xs text-stone-500">
                    Chỉ lọc các hạng mục thuộc nhóm có thể thuê/mượn (canRent =
                    true) và có số lượng còn thiếu lớn hơn 0 theo quy ước lịch
                    [startAt, endAt).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Ngày nhận đồ (startAt)
                  </label>
                  <input
                    type="date"
                    required
                    value={matchStartAt}
                    onChange={(e) => {
                      setMatchStartAt(e.target.value);
                      if (matchResult) setIsMatchStale(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Ngày trả đồ (endAt)
                  </label>
                  <input
                    type="date"
                    required
                    value={matchEndAt}
                    onChange={(e) => {
                      setMatchEndAt(e.target.value);
                      if (matchResult) setIsMatchStale(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Khu vực nhận đồ (Quận/Tỉnh)
                  </label>
                  <input
                    type="text"
                    value={matchPickupArea}
                    placeholder="VD: Đống Đa, Hà Nội"
                    onChange={(e) => {
                      setMatchPickupArea(e.target.value);
                      if (matchResult) setIsMatchStale(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Tổng ngân sách thuê (VND)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={matchBudgetInput}
                    placeholder="Bỏ trống = Không giới hạn (0 = Mượn 0đ)"
                    onChange={(e) => {
                      setMatchBudgetInput(e.target.value);
                      if (matchResult) setIsMatchStale(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Hình thức chia sẻ
                  </label>
                  <select
                    value={matchSharingType}
                    onChange={(e) => {
                      setMatchSharingType(e.target.value as any);
                      if (matchResult) setIsMatchStale(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white"
                  >
                    <option value="">Tất cả (Thuê & Mượn)</option>
                    <option value="RENT">Chỉ thuê tính phí (RENT)</option>
                    <option value="FREE_LOAN">
                      Cho mượn miễn phí (FREE_LOAN)
                    </option>
                  </select>
                </div>
              </div>

              {matchError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{matchError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-stone-500">
                  Mẹo: Bạn có thể chọn ngày nhận đồ trước ngày khởi hành để chủ
                  động kiểm tra trang bị.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={matchingGear}
                >
                  <Search className="w-4 h-4" />
                  <span>Tìm thiết bị còn thiếu</span>
                </Button>
              </div>
            </form>

            {/* Stale Match Results Warning when Checklist or Dates changed */}
            {matchResult && isMatchStale && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Kết quả gợi ý bên dưới đã cũ:</strong> Bạn vừa thay
                    đổi số lượng đồ trong checklist hoặc bộ lọc ngày/khu vực.
                    Hãy nhấn cập nhật để kiểm tra lại lịch trống mới nhất.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={matchingGear}
                  onClick={handleMatchMissingGear as any}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Cập nhật gợi ý
                </Button>
              </div>
            )}

            {/* ===============================================================
                MATCH RESULTS GROUPED BY CHECKLIST ITEM
            =============================================================== */}
            {matchResult && (
              <div className="space-y-5 pt-2">
                {/* Budget & Overall Coverage Banner */}
                <div
                  className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                    matchResult.budgetSummary.isWithinTotalBudget
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          matchResult.budgetSummary.isWithinTotalBudget
                            ? 'emerald'
                            : 'amber'
                        }
                      >
                        {matchResult.budgetSummary.statusLabel}
                      </Badge>
                      <span className="text-xs text-stone-600">
                        Khoảng thuê: <strong>{matchResult.interval.startAt}</strong> →{' '}
                        <strong>{matchResult.interval.endAt}</strong> (
                        {matchResult.interval.rentalDays} ngày)
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">
                      Tổng chi phí thuê tối thiểu ước tính:{' '}
                      <strong className="text-stone-900">
                        {formatVnd(
                          matchResult.budgetSummary.minTotalEstimatedCostVnd,
                        )}
                      </strong>{' '}
                      • Tổng tiền cọc hoàn lại dự kiến (tính riêng):{' '}
                      <strong className="text-stone-900">
                        {formatVnd(
                          matchResult.budgetSummary.minTotalDepositVnd,
                        )}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Grouped Item Matches */}
                <div className="space-y-4">
                  {matchResult.itemMatches.map((group) => (
                    <div
                      key={group.itemId}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200/90 space-y-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-stone-900">
                              {group.name}
                            </h4>
                            <Badge variant="amber">
                              Cần thuê thêm: {group.quantityMissing}{' '}
                              {group.unit}
                            </Badge>
                            {group.requiredAttributes?.size && (
                              <Badge variant="stone">
                                Size yêu cầu: {group.requiredAttributes.size}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Cần chuẩn bị: {group.quantityRequired} • Đã có:{' '}
                            {group.quantityOwned} • Còn thiếu:{' '}
                            <strong>
                              {group.quantityMissing} {group.unit}
                            </strong>
                          </p>
                        </div>

                        <Badge
                          variant={
                            group.isFullyFulfillable ? 'emerald' : 'amber'
                          }
                        >
                          {group.coverageSummaryLabel}
                        </Badge>
                      </div>

                      {group.candidates.length === 0 ? (
                        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="font-bold">
                              Chưa tìm thấy thiết bị phù hợp cho hạng mục này
                            </p>
                            <p className="text-amber-800 mt-0.5">
                              Nguyên nhân: {group.unmatchedReason}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.candidates.map((cand) => (
                            <div
                              key={cand.gearId}
                              className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200/90 flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge
                                      variant={
                                        cand.isFullCoverage
                                          ? 'emerald'
                                          : 'amber'
                                      }
                                    >
                                      {cand.coverageLabel}
                                    </Badge>
                                    <Badge variant="stone">
                                      Còn trống {cand.availableQuantity}/
                                      {cand.totalQuantity}
                                    </Badge>
                                    {cand.attributes?.sizeEu ||
                                    cand.attributes?.size ? (
                                      <Badge variant="stone">
                                        Size{' '}
                                        {cand.attributes.sizeEu ||
                                          cand.attributes.size}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <span className="text-xs font-bold text-amber-600 inline-flex items-center gap-0.5 shrink-0">
                                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                    {cand.ratingAvg}
                                  </span>
                                </div>

                                <Link
                                  to={cand.bookingUrl}
                                  className="text-sm font-bold text-stone-900 hover:text-emerald-700 line-clamp-2 block"
                                >
                                  {cand.title}
                                </Link>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                                  <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {cand.pickupAreaLabel}
                                  </span>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    Chủ đồ: @{cand.owner.username}
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                                  </span>
                                </div>

                                <div className="p-2.5 rounded-xl bg-white border border-stone-200/80 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="text-[10px] text-stone-500">
                                      Phí thuê ({cand.rentalDays} ngày ×{' '}
                                      {cand.fulfillableQuantity} {group.unit})
                                    </p>
                                    <p className="font-bold text-emerald-800 text-sm">
                                      {formatVnd(cand.estimatedRentalTotal)}
                                    </p>
                                    <p className="text-[10px] text-stone-400">
                                      ({formatVnd(cand.pricePerDay)}/ngày)
                                    </p>
                                  </div>
                                  <div className="border-l border-stone-100 pl-2.5">
                                    <p className="text-[10px] text-stone-500">
                                      Tiền cọc hoàn lại (tách riêng)
                                    </p>
                                    <p className="font-bold text-stone-900 text-sm">
                                      {formatVnd(cand.depositAmount)}
                                    </p>
                                    <p className="text-[10px] text-stone-400">
                                      ({formatVnd(cand.depositPerUnit)}/
                                      {group.unit})
                                    </p>
                                  </div>
                                </div>

                                <p className="text-[11px] text-stone-600">
                                  💡 {cand.recommendationReason}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <Link to={cand.bookingUrl}>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                  >
                                    Xem trang thiết bị
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                                <Link to={`${cand.bookingUrl}&openBooking=1`}>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    className="w-full"
                                  >
                                    Gửi yêu cầu thuê
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
