import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
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
  ChecklistVersionChange,
  GearRule,
  GearRuleDocument,
  TravelPlan,
  TravelPlanDocument,
  ValidatedTripState,
} from '../../database/schemas';
import {
  ActivityType,
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
import { ChecklistsService } from '../checklists/checklists.service';

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
    @Optional() private readonly checklistsService?: ChecklistsService,
  ) { }

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
      const initialConvStateVersion = Number(conv.stateVersion) || 1;

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

        // Only deduplicate cleanly if BOTH user & assistant messages finished persisting;
        // if an earlier write crashed halfway leaving only an orphan user message, clean it up and process normally.
        if (existingAssistantMsg) {
          const currentTripState = this.validator.normalizeExistingTripState(
            conv.tripState || (conv.parsedRequirements as any),
          );
          const validation =
            this.validator.validateTripState(currentTripState);

          let checklistPreview: ChecklistEntry[] = [];
          if (conv.checklistId) {
            const cl = await this.checklistModel
              .findById(conv.checklistId)
              .lean();
            if (cl?.items) checklistPreview = cl.items;
          }

          return {
            conversationId,
            deduplicated: true,
            status: conv.status || validation.status,
            stateVersion: conv.stateVersion || 1,
            reply: existingAssistantMsg.content || '',
            userMessage: this.formatMessage(existingUserMsg),
            assistantMessage: this.formatMessage(existingAssistantMsg),
            tripState: currentTripState,
            missingFields: conv.missingFields || validation.missingFields,
            nextQuestion: conv.nextQuestion ?? validation.nextQuestion,
            checklistPreview,
            conversation: {
              ...this.formatConversation(conv),
              checklistPreview,
            },
          };
        } else if (typeof (this.aiMessageModel as any).deleteOne === 'function') {
          await (this.aiMessageModel as any).deleteOne({
            _id: existingUserMsg._id,
          });
        }
      }

      // 2. Load recent messages + saved plan/checklist BEFORE parsing so parser resolves context accurately
      const currentTripState = this.validator.normalizeExistingTripState(
        conv.tripState || (conv.parsedRequirements as any),
      );

      const planModelAny = this.travelPlanModel as any;
      const clModelAny = this.checklistModel as any;
      const cloneSnapshot = (doc: any) => {
        if (!doc || typeof doc !== 'object') return null;
        const { toObject: _ignored, ...rest } = doc;
        return {
          ...rest,
          ...(Array.isArray(doc.items)
            ? {
              items: doc.items.map((it: any) => ({
                ...it,
                requiredAttributes: it?.requiredAttributes
                  ? { ...it.requiredAttributes }
                  : {},
              })),
            }
            : {}),
          ...(Array.isArray(doc.removedItemCodes)
            ? { removedItemCodes: [...doc.removedItemCodes] }
            : {}),
          ...(Array.isArray(doc.versionHistory)
            ? { versionHistory: doc.versionHistory.map((h: any) => ({ ...h })) }
            : {}),
          ...(Array.isArray(doc.ownedGearCodes)
            ? { ownedGearCodes: [...doc.ownedGearCodes] }
            : {}),
        };
      };

      const rawPlanBefore =
        conv.travelPlanId && typeof planModelAny.findById === 'function'
          ? await planModelAny.findById(conv.travelPlanId).lean()
          : null;
      const rawChecklistBefore =
        conv.checklistId && typeof clModelAny.findById === 'function'
          ? await clModelAny.findById(conv.checklistId).lean()
          : null;
      const existingPlanBeforeTurn = cloneSnapshot(rawPlanBefore);
      const existingChecklistBeforeTurn = cloneSnapshot(rawChecklistBefore);

      let recentMessagesRaw: any[] = [];
      if (typeof (this.aiMessageModel as any).find === 'function') {
        const msgQuery = (this.aiMessageModel as any)
          .find({ aiConversationId: convObjId })
          .sort({ _id: -1 });
        recentMessagesRaw =
          typeof msgQuery?.limit === 'function'
            ? await msgQuery.limit(8).lean()
            : (await msgQuery.lean()).slice(0, 8);
      }
      const recentMessages = [...recentMessagesRaw].reverse().map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content || ''),
        qaSubjectDestination: m.structuredPayload?.qaSubjectDestination || null,
      }));

      let patch;
      try {
        patch = await this.parser.parseUserTurn(rawText, currentTripState, {
          simulateError: dto.simulateError,
          recentMessages,
          lastAssistantQuestion: conv.nextQuestion,
          existingChecklistItems: (existingChecklistBeforeTurn?.items || []).map(
            (i: any) => ({
              categoryCode: String(i.categoryCode),
              name: String(i.name),
              quantityRequired: Number(i.quantityRequired ?? i.quantityNeeded ?? 1),
              quantityOwned: Number(i.quantityOwned || 0),
              quantityMissing: Number(i.quantityMissing || 0),
            }),
          ),
        });
      } catch (err: any) {
        if (err instanceof AiProviderException) {
          const currentValidation =
            this.validator.validateTripState(currentTripState);
          const mappedStatus =
            err.code === 'QUOTA_EXCEEDED'
              ? HttpStatus.TOO_MANY_REQUESTS
              : err.code === 'NOT_FOUND' || err.code === 'INVALID_SCHEMA'
                ? HttpStatus.BAD_GATEWAY
                : HttpStatus.SERVICE_UNAVAILABLE;
          throw new HttpException(
            {
              statusCode: mappedStatus,
              code: err.code,
              providerHttpStatus: err.httpStatus ?? null,
              message: err.message,
              canRetry: true,
              conversationId,
              stateVersion: conv.stateVersion || 1,
              tripState: currentTripState,
              missingFields:
                conv.missingFields || currentValidation.missingFields,
              status: conv.status || currentValidation.status,
            },
            mappedStatus,
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

      const hasTripStateDelta = this.hasTripStateChanged(
        currentTripState,
        nextTripState,
      );
      const hasChecklistInputDelta = this.hasChecklistAffectingChanged(
        currentTripState,
        nextTripState,
      );
      const hasChecklistOperations =
        (patch.checklistOperations?.length || 0) > 0;
      const hasNonAmbiguousMutationOp = (patch.checklistOperations || []).some(
        (op) => op.intent !== 'AMBIGUOUS_DECREMENT',
      );
      const isTripPlanWriteTurn =
        hasTripStateDelta ||
        hasNonAmbiguousMutationOp ||
        Boolean(patch.requestChecklistCreate);
      const shouldSyncPlanAndChecklist =
        (validation.status === 'READY_FOR_CHECKLIST' &&
          (hasChecklistInputDelta ||
            hasNonAmbiguousMutationOp ||
            Boolean(patch.requestChecklistCreate) ||
            (!conv.checklistId && isTripPlanWriteTurn))) ||
        (Boolean(conv.checklistId) &&
          (hasChecklistInputDelta || hasNonAmbiguousMutationOp));

      // Keep TravelPlan metadata (departureDate, pickupArea, budgetVnd, destination, wantsToRent) synced even when checklist items don't regenerate
      if (
        !shouldSyncPlanAndChecklist &&
        hasTripStateDelta &&
        conv.travelPlanId
      ) {
        await this.travelPlanModel.findByIdAndUpdate(conv.travelPlanId, {
          $set: {
            destination: nextTripState.destination || 'Việt Nam',
            route: nextTripState.route || null,
            departureDate: nextTripState.departureDate
              ? new Date(`${nextTripState.departureDate}T00:00:00.000Z`)
              : undefined,
            budgetVnd: nextTripState.budgetVnd || 0,
            pickupArea: nextTripState.pickupArea || null,
            wantsToRent: Boolean(nextTripState.wantsToRent),
          },
        });
      }

      // 4. Persist or read TravelPlan & Checklist cleanly (read-only QA/item queries never bump checklistVersion!)
      let checklistPreview: ChecklistEntry[] = [];
      let checklistMutationSummaries: string[] = [];
      let checklistClarifications: string[] = [];
      let travelPlanId = conv.travelPlanId;
      let checklistId = conv.checklistId;
      let checklistJustCreated = false;
      let didMutatePlanOrChecklist = false;

      if (shouldSyncPlanAndChecklist) {
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
        checklistJustCreated = !existingChecklistBeforeTurn;
        didMutatePlanOrChecklist = true;
      } else {
        if (existingChecklistBeforeTurn?.items) {
          checklistPreview = existingChecklistBeforeTurn.items;
        }
        if (hasChecklistOperations) {
          const preCheck = applyStructuredChecklistOperations({
            items: checklistPreview,
            removedItemCodes: existingChecklistBeforeTurn?.removedItemCodes || [],
            operations: patch.checklistOperations || [],
            isChecklistReady: Boolean(existingChecklistBeforeTurn),
          });
          checklistMutationSummaries = preCheck.appliedSummaries;
          checklistClarifications = preCheck.clarificationQuestions;

          // Persist pre-checklist required overrides, custom items, and removals across turns before checklist creation
          if (!existingChecklistBeforeTurn) {
            nextTripState.requiredGearQuantities = {
              ...(nextTripState.requiredGearQuantities || {}),
            };
            nextTripState.removedGearCodes = [
              ...(nextTripState.removedGearCodes || []),
            ];
            nextTripState.customGearItems = (
              nextTripState.customGearItems || []
            ).map((i) => ({ ...i }));

            for (const op of patch.checklistOperations || []) {
              const code = String(op.categoryCode).toUpperCase();
              if (
                op.intent === 'SET_REQUIRED' &&
                typeof op.quantity === 'number' &&
                op.quantity >= 1
              ) {
                nextTripState.requiredGearQuantities[code] = op.quantity;
                nextTripState.removedGearCodes =
                  nextTripState.removedGearCodes.filter((c) => c !== code);
              } else if (
                (op.intent === 'ADD_ITEM' ||
                  op.intent === 'INCREMENT_REQUIRED') &&
                typeof op.quantity === 'number' &&
                op.quantity >= 1
              ) {
                const existingCustom = nextTripState.customGearItems.find(
                  (c) => c.categoryCode.toUpperCase() === code,
                );
                if (existingCustom) {
                  existingCustom.quantityRequired += op.quantity;
                } else {
                  nextTripState.customGearItems.push({
                    categoryCode: code,
                    itemName: op.itemName,
                    quantityRequired: op.quantity,
                    unit: op.unit,
                  });
                }
                nextTripState.removedGearCodes =
                  nextTripState.removedGearCodes.filter((c) => c !== code);
              } else if (op.intent === 'REMOVE_ITEM') {
                if (!nextTripState.removedGearCodes.includes(code)) {
                  nextTripState.removedGearCodes.push(code);
                }
                delete nextTripState.requiredGearQuantities[code];
                nextTripState.customGearItems =
                  nextTripState.customGearItems.filter(
                    (c) => c.categoryCode.toUpperCase() !== code,
                  );
              }
            }
          }
        }
      }

      const checklistReadReplies = this.buildChecklistReadReplies(
        patch.readChecklistCodes || [],
        checklistPreview,
        Boolean(checklistId),
      );

      const savedSpotsReply = patch.requestSavedSpotsRead
        ? this.buildSavedSpotsReply(nextTripState, patch.qaSubjectDestination)
        : null;

      const missingItemsReply = patch.requestMissingItemsList
        ? this.buildMissingItemsReply(checklistPreview, Boolean(checklistId))
        : null;

      let rentalMatchReply: string | null = null;
      let rentalMatchResult: Record<string, any> | null = null;
      if (patch.requestRentalGearMatch) {
        const rentalRes = await this.buildChatRentalMatchReply({
          userId: currentUserId,
          checklistId: checklistId ? String(checklistId) : null,
          checklistItems: checklistPreview,
          tripState: nextTripState,
        });
        rentalMatchReply = rentalRes.replyText;
        rentalMatchResult = rentalRes.matchResult;
      }

      const shouldPrintFullChecklist =
        checklistJustCreated || Boolean(patch.requestChecklistPrint);

      // 5. Build natural Vietnamese assistant reply from the JUST-SAVED checklist & mutation/read results
      const assistantReplyText = this.validator.buildVietnameseAssistantReply({
        prevState: currentTripState,
        nextState: nextTripState,
        patch,
        validation,
        checklistPreview,
        checklistMutationSummaries,
        checklistClarifications,
        checklistReadReplies,
        savedSpotsReply,
        missingItemsReply,
        rentalMatchReply,
        checklistJustCreated,
        shouldPrintFullChecklist,
        userMessage: rawText,
        checklistExists: Boolean(checklistId),
      });

      const currentStateVersion = initialConvStateVersion;
      const shouldBumpStateVersion =
        hasTripStateDelta ||
        didMutatePlanOrChecklist ||
        this.hasTripStateChanged(currentTripState, nextTripState);
      const nextVersion = shouldBumpStateVersion
        ? currentStateVersion + 1
        : currentStateVersion;
      const now = new Date();

      // Auto-update conversation title when destination/activity becomes known
      let nextTitle = conv.title || 'Tư vấn chuyến đi mới';
      if (
        nextTripState.destination &&
        (nextTitle === 'Tư vấn chuyến đi mới' ||
          nextTitle.startsWith('Chuyến đi '))
      ) {
        const actPrefix =
          nextTripState.activity === ActivityType.CAMPING &&
          nextTripState.environment === 'COASTAL'
            ? 'Cắm trại biển'
            : nextTripState.activity === ActivityType.CAMPING
              ? 'Cắm trại'
              : nextTripState.activity === ActivityType.BEACH
                ? 'Đi biển'
                : nextTripState.activity === ActivityType.SIGHTSEEING
                  ? 'Tham quan'
                  : nextTripState.activity === ActivityType.TREKKING ||
                      nextTripState.activity === ActivityType.MOUNTAINEERING
                    ? 'Trekking'
                    : nextTripState.activity === ActivityType.MOTORBIKE_TOUR
                      ? 'Phượt'
                      : 'Chuyến đi';
        nextTitle = `${actPrefix} ${nextTripState.destination}${nextTripState.durationDays
          ? ` (${nextTripState.durationDays} ngày)`
          : ''
          }`;
      }

      // 6 & 7. Persist Messages + Atomically CAS-update AiConversation with compensating rollback on partial failure
      let createdUserMsg: any = null;
      let createdAssistantMsg: any = null;
      let updatedConv: any = null;

      try {
        createdUserMsg = await this.aiMessageModel.create({
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
            turnActions: patch.turnActions || [],
          },
        });

        createdAssistantMsg = await this.aiMessageModel.create({
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
            qaSubjectDestination: patch.qaSubjectDestination || null,
            turnActions: patch.turnActions || [],
            checklistMutationSummaries,
            checklistClarifications,
            checklistReadReplies,
            checklistPreview,
            ...(rentalMatchResult ? { rentalMatchResult } : {}),
          },
        });

        updatedConv = await this.aiConversationModel
          .findOneAndUpdate(
            {
              _id: convObjId,
              stateVersion: currentStateVersion,
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

        if (!updatedConv) {
          throw new ConflictException({
            code: 'CONVERSATION_VERSION_CONFLICT',
            message:
              'Cuộc hội thoại AI vừa được cập nhật đồng thời từ một tab khác. Dữ liệu đã được giữ an toàn, vui lòng tải lại và thử gửi lại.',
          });
        }
      } catch (persistErr) {
        await this.rollbackTurnMutations({
          userMsgId: createdUserMsg?._id,
          assistantMsgId: createdAssistantMsg?._id,
          didMutatePlanOrChecklist,
          prevPlanSnapshot: existingPlanBeforeTurn,
          createdPlanId:
            !existingPlanBeforeTurn && travelPlanId ? travelPlanId : undefined,
          prevChecklistSnapshot: existingChecklistBeforeTurn,
          createdChecklistId:
            !existingChecklistBeforeTurn && checklistId
              ? checklistId
              : undefined,
        });
        throw persistErr;
      }

      return {
        conversationId,
        deduplicated: false,
        status: validation.status,
        stateVersion: nextVersion,
        reply: assistantReplyText,
        userMessage: this.formatMessage(
          createdUserMsg?.toObject ? createdUserMsg.toObject() : createdUserMsg,
        ),
        assistantMessage: this.formatMessage(
          createdAssistantMsg?.toObject
            ? createdAssistantMsg.toObject()
            : createdAssistantMsg,
        ),
        tripState: nextTripState,
        missingFields: validation.missingFields,
        nextQuestion: validation.nextQuestion,
        checklistPreview,
        checklistMutationSummaries,
        checklistClarifications,
        checklistReadReplies,
        ...(rentalMatchResult ? { rentalMatchResult } : {}),
        providerMeta: patch.providerMeta,
        conversation: {
          ...this.formatConversation(updatedConv),
          checklistPreview,
        },
      };
    });
  }

  private hasChecklistAffectingChanged(
    prev: ValidatedTripState,
    next: ValidatedTripState,
  ): boolean {
    const checklistScalarKeys: Array<keyof ValidatedTripState> = [
      'activity',
      'environment',
      'isOvernight',
      'durationDays',
      'travelers',
    ];
    for (const k of checklistScalarKeys) {
      if ((prev[k] ?? null) !== (next[k] ?? null)) {
        return true;
      }
    }
    const prevGear = [...(prev.ownedGear || [])].sort().join(',');
    const nextGear = [...(next.ownedGear || [])].sort().join(',');
    if (prevGear !== nextGear) return true;

    if (
      JSON.stringify(prev.ownedGearQuantities || {}) !==
      JSON.stringify(next.ownedGearQuantities || {})
    ) {
      return true;
    }
    if (
      JSON.stringify(prev.requiredGearQuantities || {}) !==
      JSON.stringify(next.requiredGearQuantities || {})
    ) {
      return true;
    }
    const prevRemoved = [...(prev.removedGearCodes || [])].sort().join(',');
    const nextRemoved = [...(next.removedGearCodes || [])].sort().join(',');
    if (prevRemoved !== nextRemoved) return true;

    return (
      JSON.stringify(prev.customGearItems || []) !==
      JSON.stringify(next.customGearItems || [])
    );
  }

  private hasTripStateChanged(
    prev: ValidatedTripState,
    next: ValidatedTripState,
  ): boolean {
    if (this.hasChecklistAffectingChanged(prev, next)) {
      return true;
    }
    const scalarKeys: Array<keyof ValidatedTripState> = [
      'intent',
      'destination',
      'route',
      'departureDate',
      'endDate',
      'experienceLevel',
      'budgetVnd',
      'pickupArea',
      'wantsToRent',
      'notes',
    ];
    for (const k of scalarKeys) {
      if ((prev[k] ?? null) !== (next[k] ?? null)) {
        return true;
      }
    }
    const prevSec = [...(prev.secondaryActivities || [])].sort().join(',');
    const nextSec = [...(next.secondaryActivities || [])].sort().join(',');
    if (prevSec !== nextSec) return true;

    const prevSpots = [...(prev.savedSpots || [])].sort().join(',');
    const nextSpots = [...(next.savedSpots || [])].sort().join(',');
    return prevSpots !== nextSpots;
  }

  private buildSavedSpotsReply(
    tripState: ValidatedTripState,
    askedDestination?: string | null,
  ): string {
    const spots = tripState.savedSpots || [];
    if (spots.length > 0) {
      return [
        `Theo kế hoạch chuyến đi đã lưu${tripState.destination ? ` tại **${tripState.destination}**` : ''}, các điểm bạn đã chọn gồm:`,
        ...spots.map((s, i) => `${i + 1}. **${s}**`),
      ].join('\n');
    }

    if (tripState.destination) {
      const target = askedDestination || tripState.destination;
      return `Hiện trong kế hoạch chuyến đi của bạn **mới chỉ lưu điểm đến chính là ${tripState.destination}**${
        tripState.route ? ` (tuyến: ${tripState.route})` : ''
      } — **chưa lưu các điểm dừng chân hay địa điểm tham quan cụ thể nào**. Bạn có muốn mình gợi ý một vài điểm ở **${target}** để bạn chọn lưu không?`;
    }

    return 'Hiện kế hoạch chuyến đi của bạn **chưa lưu địa điểm nào**. Bạn có thể nhắn tên nơi muốn đến (ví dụ *"Tôi muốn đi Cát Bà"*) hoặc nhờ mình gợi ý địa điểm trước nhé.';
  }

  private buildMissingItemsReply(
    checklistItems: ChecklistEntry[],
    hasSavedChecklist: boolean,
  ): string {
    if (!hasSavedChecklist && checklistItems.length === 0) {
      return 'Hiện nhóm **chưa có checklist được lưu** nên chưa thể kiểm tra các món còn thiếu. Hãy hoàn thiện địa điểm, hoạt động, số ngày, số người (hoặc bấm **Tạo checklist**) rồi hỏi lại mình nhé.';
    }

    const missingItems = checklistItems.filter(
      (i) => Number(i.quantityMissing || 0) > 0,
    );
    const unconfirmedItems = checklistItems.filter(
      (i) => i.ownedConfirmed === false,
    );

    if (missingItems.length === 0 && unconfirmedItems.length === 0) {
      return '✅ Theo checklist hiện tại đã lưu, **nhóm đã đủ toàn bộ các hạng mục** (không còn món nào bị thiếu).';
    }

    const parts: string[] = [
      '📦 **Các món đang còn thiếu theo checklist hiện tại:**',
    ];

    const rentableMissing = missingItems.filter((i) => i.canRent !== false);
    const selfPrepareMissing = missingItems.filter((i) => i.canRent === false);

    if (rentableMissing.length > 0) {
      parts.push(
        '**Có thể tìm thuê / mượn trên TravelShare:**\n' +
          rentableMissing
            .map((i) => {
              const req = i.quantityRequired ?? i.quantityNeeded ?? 1;
              const warn =
                i.ownedConfirmed === false
                  ? ' *(chưa xác nhận số đã có)*'
                  : '';
              return `- **${i.name}**: thiếu **${i.quantityMissing} ${i.unit}** (cần ${req}, đã có ${i.quantityOwned})${warn}`;
            })
            .join('\n'),
      );
    }

    if (selfPrepareMissing.length > 0) {
      parts.push(
        '**Đồ cá nhân / tiêu hao cần tự chuẩn bị:**\n' +
          selfPrepareMissing
            .map((i) => {
              const req = i.quantityRequired ?? i.quantityNeeded ?? 1;
              const warn =
                i.ownedConfirmed === false
                  ? ' *(chưa xác nhận số đã có)*'
                  : '';
              return `- **${i.name}**: thiếu **${i.quantityMissing} ${i.unit}** (cần ${req}, đã có ${i.quantityOwned})${warn}`;
            })
            .join('\n'),
      );
    }

    if (unconfirmedItems.length > 0) {
      parts.push(
        `⚠️ *Lưu ý xác nhận:* Bạn từng nhắc đã có **${unconfirmedItems
          .map((i) => i.name)
          .join(', ')}** nhưng chưa chốt số lượng cụ thể, nên hệ thống đang tạm giữ nguyên phần cần chuẩn bị.`,
      );
    }

    if (rentableMissing.length > 0) {
      parts.push(
        'Bạn có thể nhắn *"Tìm thuê đồ còn thiếu"* hoặc dùng mục **Gợi ý thuê đồ còn thiếu** bên cạnh để xem danh sách thiết bị khả dụng nhé.',
      );
    }

    return parts.join('\n\n');
  }

  private async buildChatRentalMatchReply(params: {
    userId: string;
    checklistId: string | null;
    checklistItems: ChecklistEntry[];
    tripState: ValidatedTripState;
  }): Promise<{
    replyText: string;
    matchResult: Record<string, any> | null;
  }> {
    const { userId, checklistId, checklistItems, tripState } = params;

    if (!checklistId && checklistItems.length === 0) {
      return {
        replyText:
          'Hiện tại nhóm **chưa có checklist được lưu** nên mình chưa có danh sách đồ thiếu để tìm thuê. Bạn hãy hoàn tất thông tin chuyến đi (địa điểm, hoạt động, số ngày, số người) và tạo checklist trước nhé.',
        matchResult: null,
      };
    }

    const rentableMissing = checklistItems.filter(
      (i) => i.canRent !== false && Number(i.quantityMissing || 0) > 0 && i.ownedConfirmed !== false,
    );
    const selfPrepareMissing = checklistItems.filter(
      (i) => i.canRent === false && Number(i.quantityMissing || 0) > 0,
    );
    const unconfirmedRentable = checklistItems.filter(
      (i) => i.canRent !== false && i.ownedConfirmed === false,
    );

    if (rentableMissing.length === 0 && unconfirmedRentable.length === 0) {
      const selfNote =
        selfPrepareMissing.length > 0
          ? ` Chỉ còn các món **cần tự chuẩn bị cá nhân** (không cho thuê trên hệ thống): ${selfPrepareMissing
              .map((i) => `${i.name} (thiếu ${i.quantityMissing} ${i.unit})`)
              .join(', ')}.`
          : '';
      return {
        replyText: `✅ Checklist hiện tại **không còn hạng mục nào thuộc nhóm có thể thuê đang bị thiếu**.${selfNote}`,
        matchResult: null,
      };
    }

    // Check required rental context before querying inventory
    const missingRentalPrereqs: string[] = [];
    if (!tripState.departureDate) missingRentalPrereqs.push('ngày đi / ngày nhận đồ');
    if (!tripState.pickupArea) missingRentalPrereqs.push('khu vực nhận đồ (ví dụ: Cầu Giấy, Đống Đa - Hà Nội)');

    if (!this.checklistsService || !checklistId || missingRentalPrereqs.length > 0) {
      const introLines: string[] = [];
      if (rentableMissing.length > 0) {
        introLines.push(
          `**Các món đang thiếu thuộc nhóm có thể tìm thuê (${rentableMissing.length}):** ${rentableMissing
            .map((i) => `${i.name} (thiếu ${i.quantityMissing} ${i.unit})`)
            .join(', ')}.`,
        );
      }
      if (selfPrepareMissing.length > 0) {
        introLines.push(
          `**Các món thiếu cần tự chuẩn bị (không cho thuê):** ${selfPrepareMissing
            .map((i) => `${i.name} (${i.quantityMissing} ${i.unit})`)
            .join(', ')}.`,
        );
      }
      if (unconfirmedRentable.length > 0) {
        introLines.push(
          `**Chưa xác nhận số lượng đã có:** ${unconfirmedRentable
            .map((i) => i.name)
            .join(', ')} (cần chốt số đang có để tìm thuê đúng phần thiếu).`,
        );
      }
      if (missingRentalPrereqs.length > 0) {
        introLines.push(
          `Để hệ thống lọc thiết bị **đang trống lịch và gần bạn nhất**, bạn cho mình biết thêm **${missingRentalPrereqs.join(' và ')}** nhé.`,
        );
      }
      return {
        replyText: introLines.join('\n\n'),
        matchResult: null,
      };
    }

    const startDateStr = tripState.departureDate!;
    const endDateStr =
      tripState.endDate ||
      (() => {
        const d = new Date(`${startDateStr}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + Math.max(1, tripState.durationDays || 1));
        return d.toISOString().slice(0, 10);
      })();

    const matchResult = await this.checklistsService.matchMissingGear(
      userId,
      checklistId,
      {
        startAt: `${startDateStr}T07:00:00.000+07:00`,
        endAt: `${endDateStr}T18:00:00.000+07:00`,
        pickupArea: tripState.pickupArea || undefined,
        budgetVnd:
          typeof tripState.budgetVnd === 'number' && tripState.budgetVnd > 0
            ? tripState.budgetVnd
            : undefined,
      },
    );

    const outLines: string[] = [
      `🔍 **Kết quả tìm thuê đồ còn thiếu** (${startDateStr} → ${endDateStr}${
        tripState.pickupArea ? ` • khu vực ${tripState.pickupArea}` : ''
      }):`,
    ];

    const matchedCats = Array.isArray(matchResult.itemMatches)
      ? matchResult.itemMatches
      : [];
    if (matchedCats.length > 0) {
      outLines.push(
        matchedCats
          .map((cat: any) => {
            const top = Array.isArray(cat.candidates)
              ? cat.candidates[0]
              : Array.isArray(cat.matchedGear)
                ? cat.matchedGear[0]
                : null;
            if (!top) {
              return `- **${cat.name}** (thiếu ${cat.quantityMissing} ${cat.unit}): ${cat.unmatchedReason || 'Chưa tìm thấy tin đăng phù hợp.'}`;
            }
            const avail =
              top.availableQuantity ?? top.availableUnitsInWindow ?? top.fulfillableQuantity ?? 1;
            return `- **${cat.name}** (thiếu ${cat.quantityMissing} ${cat.unit}): Gợi ý **${top.title}** — **${Number(top.pricePerDay || 0).toLocaleString('vi-VN')} ₫/ngày** (${top.district || ''}${top.city ? `, ${top.city}` : ''}, còn trống ${avail}/${cat.quantityMissing}).`;
          })
          .join('\n'),
      );
    }

    const unmatchedCats = Array.isArray(matchResult.unmatchedItems)
      ? matchResult.unmatchedItems
      : [];
    if (unmatchedCats.length > 0) {
      outLines.push(
        '**Chưa tìm thấy đồ cho thuê phù hợp trên hệ thống:**\n' +
          unmatchedCats
            .map(
              (u: any) =>
                `- **${u.name}** (thiếu ${u.quantityMissing}): ${u.unmatchedReason || u.reason || 'Không tìm thấy thiết bị phù hợp.'}`,
            )
            .join('\n'),
      );
    }

    if (selfPrepareMissing.length > 0) {
      outLines.push(
        `**Các món cần tự chuẩn bị cá nhân (không tìm thuê):** ${selfPrepareMissing
          .map((i) => `${i.name} (${i.quantityMissing} ${i.unit})`)
          .join(', ')}.`,
      );
    }

    if (unconfirmedRentable.length > 0) {
      outLines.push(
        `⚠️ Chưa tìm thuê cho **${unconfirmedRentable
          .map((i) => i.name)
          .join(', ')}** vì bạn chưa xác nhận số lượng thực tế đang có.`,
      );
    }

    if (matchResult.budgetSummary?.statusLabel) {
      outLines.push(`💰 *Tình trạng ngân sách:* ${matchResult.budgetSummary.statusLabel}.`);
    }

    return {
      replyText: outLines.join('\n\n'),
      matchResult,
    };
  }

  private buildChecklistReadReplies(
    readCodes: string[],
    checklistItems: ChecklistEntry[],
    hasSavedChecklist: boolean,
  ): string[] {
    if (!readCodes || readCodes.length === 0) return [];
    if (!hasSavedChecklist && checklistItems.length === 0) {
      return [
        'Hiện tại nhóm chưa tạo checklist được lưu. Hãy cho mình biết đủ hoạt động, địa điểm, số ngày và số người (hoặc nhấn **Tạo checklist**) để kiểm tra số lượng từng món nhé.',
      ];
    }

    return readCodes.map((code) => {
      const upper = String(code).toUpperCase();
      const found = checklistItems.find(
        (i) => String(i.categoryCode).toUpperCase() === upper,
      );
      if (!found) {
        return `Hạng mục **${upper}** hiện không nằm trong checklist đang dùng (hoặc đã được bỏ khỏi danh sách).`;
      }
      const reqQty = found.quantityRequired ?? found.quantityNeeded;
      return `Theo checklist hiện tại, **${found.name}** đang cần chuẩn bị **${reqQty} ${found.unit}**, nhóm đã có **${found.quantityOwned} ${found.unit}**, **còn thiếu ${found.quantityMissing} ${found.unit}**.`;
    });
  }

  private async rollbackTurnMutations(params: {
    userMsgId?: any;
    assistantMsgId?: any;
    didMutatePlanOrChecklist: boolean;
    prevPlanSnapshot?: any;
    createdPlanId?: any;
    prevChecklistSnapshot?: any;
    createdChecklistId?: any;
  }): Promise<void> {
    try {
      const msgModelAny = this.aiMessageModel as any;
      if (typeof msgModelAny.deleteOne === 'function') {
        if (params.userMsgId) {
          await msgModelAny.deleteOne({ _id: params.userMsgId });
        }
        if (params.assistantMsgId) {
          await msgModelAny.deleteOne({ _id: params.assistantMsgId });
        }
      }

      if (params.didMutatePlanOrChecklist) {
        const clModelAny = this.checklistModel as any;
        if (params.prevChecklistSnapshot) {
          const { _id, ...restoreCl } = params.prevChecklistSnapshot;
          await this.checklistModel.findByIdAndUpdate(_id, { $set: restoreCl });
        } else if (
          params.createdChecklistId &&
          typeof clModelAny.deleteOne === 'function'
        ) {
          await clModelAny.deleteOne({ _id: params.createdChecklistId });
        }

        const planModelAny = this.travelPlanModel as any;
        if (params.prevPlanSnapshot) {
          const { _id, ...restorePlan } = params.prevPlanSnapshot;
          await this.travelPlanModel.findByIdAndUpdate(_id, {
            $set: restorePlan,
          });
        } else if (
          params.createdPlanId &&
          typeof planModelAny.deleteOne === 'function'
        ) {
          await planModelAny.deleteOne({ _id: params.createdPlanId });
        }
      }
    } catch {
      // Best-effort compensating rollback
    }
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
    const activity = tripState.activity || ActivityType.OTHER;
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
      (prevTripState.environment ?? null) !== (tripState.environment ?? null) ||
      (prevTripState.isOvernight ?? null) !== (tripState.isOvernight ?? null) ||
      prevTripState.travelers !== tripState.travelers ||
      prevTripState.durationDays !== tripState.durationDays;

    const didTravelersChange =
      Boolean(prevChecklistDoc) && prevTripState.travelers !== tripState.travelers;

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

    const prevRemovedCodes: string[] = Array.from(
      new Set([
        ...(Array.isArray(prevChecklistDoc?.removedItemCodes)
          ? prevChecklistDoc.removedItemCodes
          : []),
        ...(!prevChecklistDoc && Array.isArray(tripState.removedGearCodes)
          ? tripState.removedGearCodes
          : []),
      ]),
    );

    // 1. Determine base checklist items before applying this turn's structured checklistOperations
    let baseItems: ChecklistEntry[];
    if (didTripScaleOrActivityChange || clearedOwnedGear) {
      baseItems = buildChecklistEntriesFromRules({
        activity,
        environment: tripState.environment || null,
        isOvernight: tripState.isOvernight ?? null,
        durationDays,
        travelers,
        ownedGearCodes: tripState.ownedGear || [],
        ownedGearQuantities: tripState.ownedGearQuantities || {},
        requiredGearQuantities: tripState.requiredGearQuantities || {},
        customGearItems: !prevChecklistDoc ? tripState.customGearItems || [] : [],
        dbRules: dbRules || [],
        previousItems,
        removedItemCodes: prevRemovedCodes,
        didTravelersChange,
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

    // Sync tripState owned/required overrides & removals with the mutated checklist items
    const syncedOwnedCodes: string[] = [];
    const syncedOwnedQuantities: Record<string, number> = {
      ...(tripState.ownedGearQuantities || {}),
    };
    const syncedRequiredQuantities: Record<string, number> = {};
    const syncedCustomItems: NonNullable<ValidatedTripState['customGearItems']> = [];

    for (const item of finalItems) {
      const code = String(item.categoryCode).toUpperCase();
      if (item.quantityOwned > 0) {
        syncedOwnedCodes.push(code);
        syncedOwnedQuantities[code] = item.quantityOwned;
      } else if (item.userEditedOwned && item.quantityOwned === 0) {
        delete syncedOwnedQuantities[code];
      }
      if (item.userEditedRequired) {
        syncedRequiredQuantities[code] =
          item.quantityRequired ?? item.quantityNeeded ?? 1;
      }
      if (item.isCustomItem) {
        syncedCustomItems.push({
          categoryCode: code,
          itemName: item.name,
          quantityRequired: item.quantityRequired ?? item.quantityNeeded ?? 1,
          unit: item.unit,
        });
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
    tripState.requiredGearQuantities = syncedRequiredQuantities;
    tripState.removedGearCodes = [...finalRemovedCodes];
    tripState.customGearItems = syncedCustomItems;

    const nextPlanVersion = didTripScaleOrActivityChange
      ? (Number(prevChecklistDoc?.planVersion) || 0) + 1
      : Math.max(1, Number(prevChecklistDoc?.planVersion) || 1);

    const planPayload = {
      userId: userObjId,
      aiConversationId: convObjId,
      destination: tripState.destination || 'Việt Nam',
      route: tripState.route || null,
      activity,
      environment: tripState.environment || null,
      isOvernight: tripState.isOvernight ?? null,
      secondaryActivities: tripState.secondaryActivities || [],
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
      requiredGearQuantities: tripState.requiredGearQuantities || {},
      removedGearCodes: tripState.removedGearCodes || [],
      customGearItems: tripState.customGearItems || [],
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
    const touchedCodes = Array.from(
      new Set(
        (checklistOperations || [])
          .filter((o) => o.intent !== 'AMBIGUOUS_DECREMENT')
          .map((o) => String(o.categoryCode).toUpperCase()),
      ),
    );
    const touchedKeys = touchedCodes.flatMap((c) => [
      c,
      `item_${c.toLowerCase()}`,
    ]);
    const prevHistory: ChecklistVersionChange[] = Array.isArray(
      prevChecklistDoc?.versionHistory,
    )
      ? prevChecklistDoc.versionHistory
      : [];
    const nextHistory = [
      ...prevHistory,
      {
        version: nextChecklistVersion,
        scope:
          !prevChecklistDoc || didTripScaleOrActivityChange || clearedOwnedGear
            ? ('GLOBAL' as const)
            : ('ITEM' as const),
        itemKeys: touchedKeys,
        action: 'AI_CHAT_SYNC',
      },
    ].slice(-30);

    const checklistPayload = {
      userId: userObjId,
      travelPlanId: planDoc._id,
      aiConversationId: convObjId,
      title: checklistTitle,
      planVersion: nextPlanVersion,
      checklistVersion: nextChecklistVersion,
      items: finalItems,
      removedItemCodes: finalRemovedCodes,
      versionHistory: nextHistory,
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
