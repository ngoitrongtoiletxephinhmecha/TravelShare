import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AiConversation,
  AiConversationDocument,
  AiMessage,
  AiMessageDocument,
  Checklist,
  ChecklistDocument,
  ChecklistEntry,
  GearRule,
  GearRuleDocument,
  TravelPlan,
  TravelPlanDocument,
  ValidatedTripState,
} from '../../database/schemas';
import {
  ActivityType,
  ChecklistPriority,
  ExperienceLevel,
} from '../../common/enums/system.enums';
import {
  CreateAiConversationDto,
  GetAiMessagesQueryDto,
  SendAiMessageDto,
} from './dto/ai.dto';
import {
  AiProviderException,
  TripRequirementParser,
} from './trip-requirement.parser';
import { TripStateValidator } from './trip-state.validator';
import {
  applyStructuredChecklistOperations,
  buildChecklistEntriesFromRules,
  ParsedChecklistOperation,
} from '../checklists/checklist-mutation.engine';

const DEFAULT_GEAR_RULES: Array<{
  activity: ActivityType;
  categoryCode: string;
  itemName: string;
  unit?: string;
  priority: ChecklistPriority;
  scalingRule:
    | 'PER_PERSON'
    | 'SHARED_2_3'
    | 'ONE_PER_GROUP'
    | 'PER_PERSON_DAY_2L'
    | 'PER_PERSON_DAY';
  isRentable: boolean;
  overnightOnly?: boolean;
  reasonTemplate: string;
}> = [
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'BACKPACK',
    itemName: 'Balo trekking trợ lực (25L - 50L)',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Phân bổ trọng lượng đều lên hông và vai khi leo dốc.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TREKKING_POLES',
    itemName: 'Gậy trekking chống sốc',
    unit: 'cặp',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Giảm 25-30% áp lực lên khớp gối khi lên/xuống bậc đá dốc.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TREKKING_SHOES',
    itemName: 'Giày trekking cổ lửng chống trượt',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Bảo vệ cổ chân và bám địa hình đá ẩm rêu phong.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác gió chống nước / Áo mưa bộ',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: false,
    reasonTemplate: 'Giữ ấm và chống sương mù, mưa rừng bất chợt trên đỉnh núi.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn đội đầu siêu sáng chống nước',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Cần thiết khi xuất phát sáng sớm hoặc xuống núi lúc chiều muộn.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TENT',
    itemName: 'Lều cắm trại chống mưa 2 lớp',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    isRentable: true,
    overnightOnly: true,
    reasonTemplate: 'Dành cho hành trình trekking có nghỉ đêm ngoài trời.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'SLEEPING_BAG',
    itemName: 'Túi ngủ giữ nhiệt vùng cao',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    overnightOnly: true,
    reasonTemplate: 'Đảm bảo thân nhiệt ban đêm khi ngủ lán hoặc lều.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống & Điện giải bù khoáng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    isRentable: false,
    reasonTemplate: 'Bù nước và khoáng chất liên tục (nhu yếu phẩm tự chuẩn bị, không cho thuê).',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TRAIL_FOOD',
    itemName: 'Đồ ăn năng lượng / Lương khô / Thanh hạt',
    unit: 'suất',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY',
    isRentable: false,
    reasonTemplate: 'Bổ sung năng lượng nhanh trên đường rừng (tự chuẩn bị, không cho thuê).',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TENT',
    itemName: 'Lều cắm trại chống mưa PU3000mm+',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    isRentable: true,
    reasonTemplate: 'Không gian nghỉ ngơi chính cho nhóm cắm trại.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'CAMPING_STOVE',
    itemName: 'Bếp gas dã ngoại & bộ nồi xếp gọn',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    isRentable: true,
    reasonTemplate: 'Nấu ăn và pha đồ uống nóng tại bãi trại.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'CAMPING_CHAIR',
    itemName: 'Ghế xếp camping thư giãn',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Tăng trải nghiệm nghỉ ngơi thoải mái bên hồ/bãi cỏ.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn lồng / Đèn đội đầu cắm trại',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    isRentable: true,
    reasonTemplate: 'Chiếu sáng khu vực trại vào buổi tối.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống sinh hoạt & nấu nướng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    isRentable: false,
    reasonTemplate: 'Nước sạch dùng để nấu ăn và uống tại bãi trại (tự chuẩn bị).',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TRAIL_FOOD',
    itemName: 'Thực phẩm BBQ / Đồ ăn dã ngoại',
    unit: 'suất',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY',
    isRentable: false,
    reasonTemplate: 'Thực phẩm tươi và đồ ăn nhẹ theo khẩu vị nhóm (tự chuẩn bị).',
  },
];

@Injectable()
export class AiService {
  private readonly conversationLocks = new Map<string, Promise<any>>();

  constructor(
    @InjectModel(AiConversation.name)
    private readonly aiConversationModel: Model<AiConversationDocument>,
    @InjectModel(AiMessage.name)
    private readonly aiMessageModel: Model<AiMessageDocument>,
    @InjectModel(TravelPlan.name)
    private readonly travelPlanModel: Model<TravelPlanDocument>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<ChecklistDocument>,
    @InjectModel(GearRule.name)
    private readonly gearRuleModel: Model<GearRuleDocument>,
    private readonly parser: TripRequirementParser,
    private readonly validator: TripStateValidator,
  ) {}

  /**
   * Ensure sequential execution per conversation so concurrent requests never race or overwrite newer state
   */
  private async runWithConversationLock<T>(
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const prev = this.conversationLocks.get(conversationId) || Promise.resolve();
    let release!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.conversationLocks.set(
      conversationId,
      prev.then(() => nextLock).catch(() => nextLock),
    );

    await prev.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.conversationLocks.get(conversationId) === nextLock) {
        this.conversationLocks.delete(conversationId);
      }
    }
  }

  private assertOwnership(
    conv: any,
    currentUserId: string,
  ): asserts conv is Record<string, any> {
    if (!conv) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại Trợ lý AI');
    }
    if (String(conv.userId) !== String(currentUserId)) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập hoặc chỉnh sửa cuộc hội thoại AI của người dùng khác',
      );
    }
  }

  /**
   * Create a new AI Travel Assistant conversation (optionally processing an initial message)
   */
  async createConversation(
    currentUserId: string,
    dto?: CreateAiConversationDto,
  ): Promise<Record<string, any>> {
    const initialTripState = this.validator.createEmptyTripState();
    const initialValidation = this.validator.validateTripState(initialTripState);
    const now = new Date();

    const createdDoc = await this.aiConversationModel.create({
      userId: new Types.ObjectId(String(currentUserId)),
      title: dto?.title?.trim() || 'Tư vấn chuyến đi mới',
      status: initialValidation.status,
      stateVersion: 1,
      tripState: initialTripState,
      parsedRequirements: initialTripState as unknown as Record<string, unknown>,
      missingFields: initialValidation.missingFields,
      nextQuestion: initialValidation.nextQuestion,
      lastMessagePreview:
        'Xin chào! Hãy mô tả chuyến đi dự kiến của bạn (ví dụ: Tôi muốn trekking Yên Tử)...',
      lastMessageAt: now,
    });

    const convObj = createdDoc.toObject();
    const convId = String(convObj._id);

    if (dto?.initialMessage && dto.initialMessage.trim()) {
      const turnResult = await this.sendMessage(convId, currentUserId, {
        content: dto.initialMessage.trim(),
        clientMessageId:
          dto.clientMessageId || `init-${convId}-${Date.now()}`,
      });
      return {
        ...turnResult.conversation,
        initialTurn: turnResult,
      };
    }

    return this.formatConversation(convObj);
  }

  /**
   * List all AI conversations belonging to currentUserId
   */
  async listMyConversations(
    currentUserId: string,
  ): Promise<Record<string, any>[]> {
    const docs = await this.aiConversationModel
      .find({ userId: new Types.ObjectId(String(currentUserId)) })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();

    return docs.map((d: any) => this.formatConversation(d));
  }

  /**
   * Get single AI conversation detail with current tripState and checklist preview
   */
  async getConversationById(
    conversationId: string,
    currentUserId: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại Trợ lý AI');
    }

    const conv = await this.aiConversationModel.findById(conversationId).lean();
    this.assertOwnership(conv, currentUserId);

    let checklistPreview: ChecklistEntry[] = [];
    if (conv?.checklistId) {
      const cl = await this.checklistModel.findById(conv.checklistId).lean();
      if (cl?.items) {
        checklistPreview = cl.items;
      }
    }

    return {
      ...this.formatConversation(conv),
      checklistPreview,
    };
  }

  /**
   * Get paginated message history + current conversation state
   */
  async getConversationMessages(
    conversationId: string,
    currentUserId: string,
    query?: GetAiMessagesQueryDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại Trợ lý AI');
    }

    const conv = await this.aiConversationModel.findById(conversationId).lean();
    this.assertOwnership(conv, currentUserId);

    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 40));
    const filter: Record<string, any> = {
      aiConversationId: new Types.ObjectId(conversationId),
    };

    if (query?.beforeId && Types.ObjectId.isValid(query.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(query.beforeId) };
    }

    const docsDesc = await this.aiMessageModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docsDesc.length > limit;
    const slicedDesc = hasMore ? docsDesc.slice(0, limit) : docsDesc;
    const chronological = [...slicedDesc].reverse();
    const nextCursor =
      hasMore && chronological.length > 0
        ? String(chronological[0]._id)
        : null;

    let checklistPreview: ChecklistEntry[] = [];
    if (conv?.checklistId) {
      const cl = await this.checklistModel.findById(conv.checklistId).lean();
      if (cl?.items) {
        checklistPreview = cl.items;
      }
    }

    return {
      conversationId,
      conversation: {
        ...this.formatConversation(conv),
        checklistPreview,
      },
      items: chronological.map((m: any) => this.formatMessage(m)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Send a user message to an AI conversation:
   * - Enforces ownership
   * - Deduplicates by `clientMessageId`
   * - Serializes turns per conversation + increments `stateVersion`
   * - Preserves existing validated `tripState` if Gemini fails (timeout/quota/schema)
   */
  async sendMessage(
    conversationId: string,
    currentUserId: string,
    dto: SendAiMessageDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại Trợ lý AI');
    }

    const rawText = (dto.content ?? dto.message ?? '').trim();
    if (!rawText) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống');
    }

    const clientMessageId =
      dto.clientMessageId?.trim() || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return this.runWithConversationLock(conversationId, async () => {
      const conv = await this.aiConversationModel
        .findById(conversationId)
        .lean();
      this.assertOwnership(conv, currentUserId);

      const convObjId = new Types.ObjectId(conversationId);
      const userObjId = new Types.ObjectId(String(currentUserId));

      // 1. Check idempotency: has this `clientMessageId` already been processed?
      const existingUserMsg = await this.aiMessageModel
        .findOne({
          aiConversationId: convObjId,
          role: 'user',
          clientMessageId,
        })
        .lean();

      if (existingUserMsg) {
        const existingAssistantMsg = await this.aiMessageModel
          .findOne({
            aiConversationId: convObjId,
            role: 'assistant',
            replyToMessageId: existingUserMsg._id,
          })
          .lean();

        const currentTripState = this.validator.normalizeExistingTripState(
          conv.tripState || (conv.parsedRequirements as any),
        );
        const validation = this.validator.validateTripState(currentTripState);

        let checklistPreview: ChecklistEntry[] = [];
        if (conv.checklistId) {
          const cl = await this.checklistModel.findById(conv.checklistId).lean();
          if (cl?.items) checklistPreview = cl.items;
        }

        return {
          conversationId,
          deduplicated: true,
          status: conv.status || validation.status,
          stateVersion: conv.stateVersion || 1,
          reply: existingAssistantMsg?.content || '',
          userMessage: this.formatMessage(existingUserMsg),
          assistantMessage: existingAssistantMsg
            ? this.formatMessage(existingAssistantMsg)
            : null,
          tripState: currentTripState,
          missingFields: conv.missingFields || validation.missingFields,
          nextQuestion: conv.nextQuestion ?? validation.nextQuestion,
          checklistPreview,
          conversation: {
            ...this.formatConversation(conv),
            checklistPreview,
          },
        };
      }

      // 2. Parse user input and validate schema (before mutating conversation state!)
      const currentTripState = this.validator.normalizeExistingTripState(
        conv.tripState || (conv.parsedRequirements as any),
      );

      let patch;
      try {
        patch = await this.parser.parseUserTurn(rawText, currentTripState, {
          simulateError: dto.simulateError,
        });
      } catch (err: any) {
        if (err instanceof AiProviderException) {
          const currentValidation =
            this.validator.validateTripState(currentTripState);
          throw new HttpException(
            {
              statusCode: HttpStatus.SERVICE_UNAVAILABLE,
              code: err.code,
              message: err.message,
              canRetry: true,
              conversationId,
              stateVersion: conv.stateVersion || 1,
              tripState: currentTripState,
              missingFields:
                conv.missingFields || currentValidation.missingFields,
              status: conv.status || currentValidation.status,
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        throw err;
      }

      // 3. Merge & validate new tripState
      const nextTripState = this.validator.mergeTripState(
        currentTripState,
        patch,
      );
      const validation = this.validator.validateTripState(
        nextTripState,
        patch.ambiguousDateNote,
      );

      // 4. If READY_FOR_CHECKLIST (or checklist already exists), generate/update real TravelPlan & Checklist in MongoDB
      let checklistPreview: ChecklistEntry[] = [];
      let checklistMutationSummaries: string[] = [];
      let checklistClarifications: string[] = [];
      let travelPlanId = conv.travelPlanId;
      let checklistId = conv.checklistId;

      if (validation.status === 'READY_FOR_CHECKLIST' || checklistId) {
        const synced = await this.syncTravelPlanAndChecklist({
          userId: currentUserId,
          conversationId,
          prevTripState: currentTripState,
          nextTripState,
          checklistOperations: patch.checklistOperations || [],
          clearedOwnedGear: Boolean(patch.clearedFields?.includes('ownedGear')),
          existingPlanId: travelPlanId,
          existingChecklistId: checklistId,
        });
        travelPlanId = synced.travelPlanId;
        checklistId = synced.checklistId;
        checklistPreview = synced.items;
        checklistMutationSummaries = synced.appliedSummaries;
        checklistClarifications = synced.clarificationQuestions;
      } else if (patch.checklistOperations && patch.checklistOperations.length > 0) {
        // Checklist is not ready yet (missing destination/activity/travelers/durationDays),
        // but user mentioned checklist item commands -> collect any immediate clarification questions
        const preCheck = applyStructuredChecklistOperations({
          items: [],
          removedItemCodes: [],
          operations: patch.checklistOperations,
          isChecklistReady: false,
        });
        checklistMutationSummaries = preCheck.appliedSummaries;
        checklistClarifications = preCheck.clarificationQuestions;
      }

      // 5. Build natural Vietnamese assistant reply from the JUST-SAVED checklist & mutation results
      const assistantReplyText = this.validator.buildVietnameseAssistantReply({
        prevState: currentTripState,
        nextState: nextTripState,
        patch,
        validation,
        checklistPreview,
        checklistMutationSummaries,
        checklistClarifications,
      });

      const nextVersion = (conv.stateVersion || 1) + 1;
      const now = new Date();

      // Auto-update conversation title when destination/activity becomes known
      let nextTitle = conv.title || 'Tư vấn chuyến đi mới';
      if (
        nextTripState.destination &&
        (nextTitle === 'Tư vấn chuyến đi mới' ||
          nextTitle.startsWith('Chuyến đi '))
      ) {
        const actPrefix =
          nextTripState.activity === ActivityType.CAMPING
            ? 'Cắm trại'
            : 'Trekking';
        nextTitle = `${actPrefix} ${nextTripState.destination}${
          nextTripState.durationDays
            ? ` (${nextTripState.durationDays} ngày)`
            : ''
        }`;
      }

      // 6. Persist User Message & Assistant Message
      const createdUserMsg = await this.aiMessageModel.create({
        aiConversationId: convObjId,
        userId: userObjId,
        role: 'user',
        content: rawText,
        clientMessageId,
        stateVersion: nextVersion,
        structuredPayload: {
          extractedPatch: patch.updatedFields,
          clearedFields: patch.clearedFields,
          checklistOperations: patch.checklistOperations || [],
        },
      });

      const createdAssistantMsg = await this.aiMessageModel.create({
        aiConversationId: convObjId,
        userId: userObjId,
        role: 'assistant',
        content: assistantReplyText,
        replyToMessageId: createdUserMsg._id,
        stateVersion: nextVersion,
        structuredPayload: {
          tripState: nextTripState,
          missingFields: validation.missingFields,
          status: validation.status,
          nextQuestion: validation.nextQuestion,
          providerMeta: patch.providerMeta,
          checklistMutationSummaries,
          checklistClarifications,
          checklistPreview,
        },
      });

      // 7. Atomically update AiConversation state with version check
      const updatedConv = await this.aiConversationModel
        .findOneAndUpdate(
          {
            _id: convObjId,
            stateVersion: conv.stateVersion || 1,
          },
          {
            $set: {
              title: nextTitle,
              status: validation.status,
              stateVersion: nextVersion,
              tripState: nextTripState,
              parsedRequirements: nextTripState as unknown as Record<
                string,
                unknown
              >,
              missingFields: validation.missingFields,
              nextQuestion: validation.nextQuestion,
              lastMessagePreview: assistantReplyText.slice(0, 140),
              lastMessageAt: now,
              ...(travelPlanId ? { travelPlanId } : {}),
              ...(checklistId ? { checklistId } : {}),
            },
          },
          { new: true },
        )
        .lean();

      const finalConv = updatedConv || {
        ...conv,
        title: nextTitle,
        status: validation.status,
        stateVersion: nextVersion,
        tripState: nextTripState,
        parsedRequirements: nextTripState,
        missingFields: validation.missingFields,
        nextQuestion: validation.nextQuestion,
        lastMessagePreview: assistantReplyText.slice(0, 140),
        lastMessageAt: now,
        travelPlanId,
        checklistId,
      };

      return {
        conversationId,
        deduplicated: false,
        status: validation.status,
        stateVersion: nextVersion,
        reply: assistantReplyText,
        userMessage: this.formatMessage(createdUserMsg.toObject()),
        assistantMessage: this.formatMessage(createdAssistantMsg.toObject()),
        tripState: nextTripState,
        missingFields: validation.missingFields,
        nextQuestion: validation.nextQuestion,
        checklistPreview,
        checklistMutationSummaries,
        checklistClarifications,
        providerMeta: patch.providerMeta,
        conversation: {
          ...this.formatConversation(finalConv),
          checklistPreview,
        },
      };
    });
  }

  /**
   * Synchronize TravelPlan & Checklist in MongoDB using the shared checklist mutation engine:
   * - Regenerates rule-based items when trip parameters (activity/travelers/durationDays) change or no checklist exists yet,
   *   while preserving compatible manual edits (`userEditedOwned`, `userEditedRequired`, `isCustomItem`, `removedItemCodes`).
   * - Otherwise starts from the existing saved checklist items so unmentioned items remain 100% untouched.
   * - Applies structured `checklistOperations` (`SET_OWNED`, `INCREMENT_OWNED`, `DECREMENT_OWNED`, `SET_MISSING`, `SET_REQUIRED`, `ADD_ITEM`, `REMOVE_ITEM`, etc.).
   * - Saves to MongoDB first, then returns the saved items + confirmation summaries + clarification prompts for the turn reply.
   */
  private async syncTravelPlanAndChecklist(params: {
    userId: string;
    conversationId: string;
    prevTripState: ValidatedTripState;
    nextTripState: ValidatedTripState;
    checklistOperations: ParsedChecklistOperation[];
    clearedOwnedGear?: boolean;
    existingPlanId?: Types.ObjectId;
    existingChecklistId?: Types.ObjectId;
  }): Promise<{
    travelPlanId: Types.ObjectId;
    checklistId: Types.ObjectId;
    items: ChecklistEntry[];
    appliedSummaries: string[];
    clarificationQuestions: string[];
  }> {
    const {
      userId,
      conversationId,
      prevTripState,
      nextTripState: tripState,
      checklistOperations,
      clearedOwnedGear,
      existingPlanId,
      existingChecklistId,
    } = params;

    const userObjId = new Types.ObjectId(String(userId));
    const convObjId = new Types.ObjectId(String(conversationId));
    const activity = tripState.activity || ActivityType.TREKKING;
    const travelers = Math.max(1, tripState.travelers || 1);
    const durationDays = Math.max(1, tripState.durationDays || 1);

    const dbRules = await this.gearRuleModel.find({ activity }).lean();

    let prevChecklistDoc: any = null;
    if (existingChecklistId) {
      prevChecklistDoc = await this.checklistModel
        .findById(existingChecklistId)
        .lean();
    }

    const didTripScaleOrActivityChange =
      !prevChecklistDoc ||
      prevTripState.activity !== tripState.activity ||
      prevTripState.travelers !== tripState.travelers ||
      prevTripState.durationDays !== tripState.durationDays;

    const didTravelersOrDurationChange =
      Boolean(prevChecklistDoc) &&
      (prevTripState.travelers !== tripState.travelers ||
        prevTripState.durationDays !== tripState.durationDays);

    let previousItems: ChecklistEntry[] = Array.isArray(prevChecklistDoc?.items)
      ? prevChecklistDoc.items
      : [];

    if (clearedOwnedGear && previousItems.length > 0) {
      previousItems = previousItems.map((it) => ({
        ...it,
        quantityOwned: 0,
        quantityMissing: Math.max(0, Number(it.quantityRequired || it.quantityNeeded || 1)),
        ownedConfirmed: true,
        userEditedOwned: false,
      }));
    }

    const prevRemovedCodes: string[] = Array.isArray(
      prevChecklistDoc?.removedItemCodes,
    )
      ? prevChecklistDoc.removedItemCodes
      : [];

    // 1. Determine base checklist items before applying this turn's structured checklistOperations
    let baseItems: ChecklistEntry[];
    if (didTripScaleOrActivityChange || clearedOwnedGear) {
      baseItems = buildChecklistEntriesFromRules({
        activity,
        durationDays,
        travelers,
        ownedGearCodes: tripState.ownedGear || [],
        ownedGearQuantities: tripState.ownedGearQuantities || {},
        dbRules: dbRules || [],
        previousItems,
        removedItemCodes: prevRemovedCodes,
        didTravelersOrDurationChange,
      });
    } else {
      baseItems = previousItems;
    }

    // 2. Apply structured checklist operations from this chat turn
    const mutationResult = applyStructuredChecklistOperations({
      items: baseItems,
      removedItemCodes: prevRemovedCodes,
      operations: checklistOperations || [],
      isChecklistReady: true,
    });

    const finalItems = mutationResult.items;
    const finalRemovedCodes = mutationResult.removedItemCodes;

    // Sync tripState.ownedGearQuantities & ownedGear with the mutated checklist items
    const syncedOwnedCodes: string[] = [];
    const syncedOwnedQuantities: Record<string, number> = {
      ...(tripState.ownedGearQuantities || {}),
    };
    for (const item of finalItems) {
      if (item.quantityOwned > 0) {
        syncedOwnedCodes.push(item.categoryCode);
        syncedOwnedQuantities[item.categoryCode] = item.quantityOwned;
      } else if (item.userEditedOwned && item.quantityOwned === 0) {
        delete syncedOwnedQuantities[item.categoryCode];
      }
    }
    for (const code of tripState.ownedGear || []) {
      const upper = code.toUpperCase();
      if (
        !finalRemovedCodes.includes(upper) &&
        !syncedOwnedCodes.includes(upper)
      ) {
        const matched = finalItems.find((i) => i.categoryCode === upper);
        if (!matched || !matched.userEditedOwned) {
          syncedOwnedCodes.push(upper);
        }
      }
    }
    tripState.ownedGear = Array.from(new Set(syncedOwnedCodes));
    tripState.ownedGearQuantities = syncedOwnedQuantities;

    const nextPlanVersion = didTripScaleOrActivityChange
      ? (Number(prevChecklistDoc?.planVersion) || 0) + 1
      : Math.max(1, Number(prevChecklistDoc?.planVersion) || 1);

    const planPayload = {
      userId: userObjId,
      aiConversationId: convObjId,
      destination: tripState.destination || 'Việt Nam',
      route: tripState.route || null,
      activity,
      departureDate: tripState.departureDate
        ? new Date(`${tripState.departureDate}T00:00:00.000Z`)
        : undefined,
      durationDays,
      travelers,
      experienceLevel: tripState.experienceLevel || ExperienceLevel.BEGINNER,
      budgetVnd: tripState.budgetVnd || 0,
      pickupArea: tripState.pickupArea || null,
      ownedGearCodes: tripState.ownedGear || [],
      ownedGearQuantities: tripState.ownedGearQuantities || {},
      wantsToRent: Boolean(tripState.wantsToRent),
      planVersion: nextPlanVersion,
    };

    let planDoc: any;
    if (existingPlanId) {
      planDoc = await this.travelPlanModel
        .findByIdAndUpdate(existingPlanId, { $set: planPayload }, { new: true })
        .lean();
    }
    if (!planDoc) {
      const createdPlan = await this.travelPlanModel.create(planPayload);
      planDoc = createdPlan.toObject();
    }

    const checklistTitle = `Checklist ${tripState.destination || 'Chuyến đi'} (${durationDays} ngày • ${travelers} người)`;
    const nextChecklistVersion =
      (Number(prevChecklistDoc?.checklistVersion) || 0) + 1;
    const checklistPayload = {
      userId: userObjId,
      travelPlanId: planDoc._id,
      aiConversationId: convObjId,
      title: checklistTitle,
      planVersion: nextPlanVersion,
      checklistVersion: nextChecklistVersion,
      items: finalItems,
      removedItemCodes: finalRemovedCodes,
    };

    let checklistDoc: any;
    if (existingChecklistId) {
      checklistDoc = await this.checklistModel
        .findByIdAndUpdate(
          existingChecklistId,
          { $set: checklistPayload },
          { new: true },
        )
        .lean();
    }
    if (!checklistDoc) {
      const createdChecklist = await this.checklistModel.create(checklistPayload);
      checklistDoc = createdChecklist.toObject();
    }

    const savedItems: ChecklistEntry[] = Array.isArray(checklistDoc?.items)
      ? checklistDoc.items
      : finalItems;

    return {
      travelPlanId: planDoc._id,
      checklistId: checklistDoc._id,
      items: savedItems,
      appliedSummaries: mutationResult.appliedSummaries,
      clarificationQuestions: mutationResult.clarificationQuestions,
    };
  }

  private formatConversation(c: any): Record<string, any> {
    if (!c) return {};
    const tripState = this.validator.normalizeExistingTripState(
      c.tripState || c.parsedRequirements,
    );
    const validation = this.validator.validateTripState(tripState);

    return {
      id: String(c._id),
      conversationId: String(c._id),
      sessionId: String(c._id), // Alias for backward compatibility
      userId: String(c.userId),
      title: c.title || 'Tư vấn chuyến đi mới',
      status: c.status || validation.status,
      stateVersion: c.stateVersion || 1,
      tripState,
      missingFields: Array.isArray(c.missingFields)
        ? c.missingFields
        : validation.missingFields,
      nextQuestion:
        c.nextQuestion !== undefined ? c.nextQuestion : validation.nextQuestion,
      lastMessagePreview: c.lastMessagePreview || '',
      lastMessageAt: c.lastMessageAt || c.updatedAt || c.createdAt,
      travelPlanId: c.travelPlanId ? String(c.travelPlanId) : null,
      checklistId: c.checklistId ? String(c.checklistId) : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private formatMessage(m: any): Record<string, any> {
    if (!m) return {};
    return {
      id: String(m._id),
      aiConversationId: String(m.aiConversationId),
      conversationId: String(m.aiConversationId),
      role: m.role,
      content: m.content,
      clientMessageId: m.clientMessageId || undefined,
      replyToMessageId: m.replyToMessageId
        ? String(m.replyToMessageId)
        : undefined,
      stateVersion: m.stateVersion || 1,
      structuredPayload: m.structuredPayload || null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
}
