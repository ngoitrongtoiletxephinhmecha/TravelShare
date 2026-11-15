import { ForbiddenException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AiService } from './ai.service';
import { TripRequirementParser } from './trip-requirement.parser';
import { TripStateValidator } from './trip-state.validator';
import { ActivityType } from '../../common/enums/system.enums';

describe('AiService, TripRequirementParser & TripStateValidator Suite (Phase 6)', () => {
  const user1Id = new Types.ObjectId().toString();
  const user2Id = new Types.ObjectId().toString();

  let aiConversationsStore: Map<string, any>;
  let aiMessagesStore: Map<string, any>;
  let travelPlansStore: Map<string, any>;
  let checklistsStore: Map<string, any>;
  let gearRulesStore: any[];

  let configService: ConfigService;
  let parser: TripRequirementParser;
  let validator: TripStateValidator;
  let aiService: AiService;

  const makeChainable = (result: any) => ({
    lean: jest.fn().mockResolvedValue(result),
    sort: jest.fn().mockImplementation((sortObj: Record<string, number>) => {
      const sorted = Array.isArray(result) ? [...result] : result;
      if (Array.isArray(sorted)) {
        if (sortObj._id === -1) {
          sorted.sort((a, b) => String(b._id).localeCompare(String(a._id)));
        } else if (sortObj._id === 1) {
          sorted.sort((a, b) => String(a._id).localeCompare(String(b._id)));
        }
      }
      return {
        lean: jest.fn().mockResolvedValue(sorted),
        limit: jest.fn().mockImplementation((n: number) => ({
          lean: jest.fn().mockResolvedValue(
            Array.isArray(sorted) ? sorted.slice(0, n) : sorted,
          ),
        })),
      };
    }),
  });

  beforeEach(() => {
    aiConversationsStore = new Map();
    aiMessagesStore = new Map();
    travelPlansStore = new Map();
    checklistsStore = new Map();
    gearRulesStore = [];

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'gemini.apiKey') return '';
        if (key === 'gemini.model') return 'gemini-2.5-flash';
        if (key === 'gemini.timeoutMs') return 5000;
        return undefined;
      }),
    } as any;

    parser = new TripRequirementParser(configService);
    validator = new TripStateValidator();

    const mockAiConversationModel: any = {
      create: jest.fn().mockImplementation((payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        aiConversationsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(aiConversationsStore.get(String(id)) || null);
      }),
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(aiConversationsStore.values()).filter(
          (c) => String(c.userId) === String(filter.userId),
        );
        return makeChainable(list);
      }),
      findOneAndUpdate: jest.fn().mockImplementation((filter: any, update: any) => {
        const existing = aiConversationsStore.get(String(filter._id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
          aiConversationsStore.set(String(existing._id), existing);
        }
        return makeChainable(existing || null);
      }),
    };

    const mockAiMessageModel: any = {
      findOne: jest.fn().mockImplementation((filter: any) => {
        const found =
          Array.from(aiMessagesStore.values()).find((m) => {
            if (
              String(m.aiConversationId) !== String(filter.aiConversationId)
            ) {
              return false;
            }
            if (filter.role && m.role !== filter.role) return false;
            if (
              filter.clientMessageId &&
              m.clientMessageId !== filter.clientMessageId
            ) {
              return false;
            }
            if (
              filter.replyToMessageId &&
              String(m.replyToMessageId) !== String(filter.replyToMessageId)
            ) {
              return false;
            }
            return true;
          }) || null;
        return makeChainable(found);
      }),
      create: jest.fn().mockImplementation((payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        aiMessagesStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(aiMessagesStore.values()).filter((m) => {
          if (String(m.aiConversationId) !== String(filter.aiConversationId)) {
            return false;
          }
          if (filter._id?.$lt) {
            return String(m._id) < String(filter._id.$lt);
          }
          return true;
        });
        return makeChainable(list);
      }),
    };

    const mockTravelPlanModel: any = {
      create: jest.fn().mockImplementation((payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          toObject() {
            return { ...this };
          },
        };
        travelPlansStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = travelPlansStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set);
          travelPlansStore.set(String(id), existing);
        }
        return makeChainable(existing || null);
      }),
    };

    const mockChecklistModel: any = {
      create: jest.fn().mockImplementation((payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          toObject() {
            return { ...this };
          },
        };
        checklistsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(checklistsStore.get(String(id)) || null);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = checklistsStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set);
          checklistsStore.set(String(id), existing);
        }
        return makeChainable(existing || null);
      }),
    };

    const mockGearRuleModel: any = {
      find: jest.fn().mockImplementation(() => makeChainable(gearRulesStore)),
    };

    aiService = new AiService(
      mockAiConversationModel,
      mockAiMessageModel,
      mockTravelPlanModel,
      mockChecklistModel,
      mockGearRuleModel,
      parser,
      validator,
    );
  });

  // =========================================================================
  // 1-4. MULTI-TURN YÊN TỬ CONVERSATION & PAGE RELOAD PERSISTENCE
  // =========================================================================
  it('completes the multi-turn Yên Tử trekking flow, updates travelers 3 -> 4, and persists history on reload', async () => {
    const conv = await aiService.createConversation(user1Id, {});
    expect(conv.id).toBeDefined();
    expect(conv.status).toBe('NEEDS_INFORMATION');

    // Lượt 1: "Tôi muốn trekking Yên Tử"
    const turn1 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn trekking Yên Tử',
      clientMessageId: 'turn-1-yentu',
    });

    expect(turn1.tripState.destination).toBe('Yên Tử');
    expect(turn1.tripState.activity).toBe(ActivityType.TREKKING);
    expect(turn1.tripState.durationDays).toBeNull();
    expect(turn1.tripState.travelers).toBeNull();
    expect(turn1.tripState.budgetVnd).toBeNull();
    expect(turn1.status).toBe('NEEDS_INFORMATION');
    expect(turn1.missingFields).toEqual(
      expect.arrayContaining(['durationDays', 'travelers']),
    );
    expect(turn1.reply).toContain('Yên Tử');

    // Lượt 2: "Đi một ngày, nhóm ba người"
    const turn2 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Đi một ngày, nhóm ba người',
      clientMessageId: 'turn-2-1day-3pax',
    });

    expect(turn2.tripState.destination).toBe('Yên Tử');
    expect(turn2.tripState.activity).toBe(ActivityType.TREKKING);
    expect(turn2.tripState.durationDays).toBe(1);
    expect(turn2.tripState.travelers).toBe(3);
    expect(turn2.status).toBe('READY_FOR_CHECKLIST');
    expect(turn2.missingFields).toEqual([]);
    expect(turn2.checklistPreview.length).toBeGreaterThan(0);

    // Verify checklist item scaling for 3 people
    const backpackItemTurn2 = turn2.checklistPreview.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(backpackItemTurn2?.quantityNeeded).toBe(3);

    // Lượt 3: "Thực ra nhóm có bốn người"
    const turn3 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Thực ra nhóm có bốn người',
      clientMessageId: 'turn-3-update-4pax',
    });

    expect(turn3.tripState.destination).toBe('Yên Tử');
    expect(turn3.tripState.activity).toBe(ActivityType.TREKKING);
    expect(turn3.tripState.durationDays).toBe(1);
    expect(turn3.tripState.travelers).toBe(4);
    expect(turn3.status).toBe('READY_FOR_CHECKLIST');

    // Verify checklist item scaling updated to 4 people
    const backpackItemTurn3 = turn3.checklistPreview.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(backpackItemTurn3?.quantityNeeded).toBe(4);

    // Lượt 4: Tải lại trang (getConversationMessages & getConversationById)
    const reloadedHistory = await aiService.getConversationMessages(
      conv.id,
      user1Id,
      { limit: 40 },
    );
    expect(reloadedHistory.items.length).toBe(6); // 3 user + 3 assistant messages
    expect(reloadedHistory.conversation.tripState.destination).toBe('Yên Tử');
    expect(reloadedHistory.conversation.tripState.durationDays).toBe(1);
    expect(reloadedHistory.conversation.tripState.travelers).toBe(4);
  });

  // =========================================================================
  // 5. IDEMPOTENCY (clientMessageId) & GEMINI ERROR RESILIENCE
  // =========================================================================
  it('deduplicates repeated clientMessageId and preserves tripState when Gemini fails', async () => {
    const conv = await aiService.createConversation(user1Id, {});

    await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn trekking Yên Tử đi một ngày, nhóm bốn người',
      clientMessageId: 'msg-idempotent-1',
    });

    const countBeforeRetry = aiMessagesStore.size;
    expect(countBeforeRetry).toBe(2); // 1 user + 1 assistant

    // Retry with the exact same clientMessageId
    const retryRes = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn trekking Yên Tử đi một ngày, nhóm bốn người',
      clientMessageId: 'msg-idempotent-1',
    });

    expect(retryRes.deduplicated).toBe(true);
    expect(aiMessagesStore.size).toBe(2); // Still only 2 messages in DB!
    expect(retryRes.tripState.destination).toBe('Yên Tử');
    expect(retryRes.tripState.travelers).toBe(4);

    // Simulate Gemini TIMEOUT error -> must NOT corrupt existing tripState
    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Thêm ngân sách 500k',
        clientMessageId: 'msg-timeout-err',
        simulateError: 'TIMEOUT',
      }),
    ).rejects.toThrow(HttpException);

    // Simulate malformed JSON from Gemini -> must throw INVALID_SCHEMA and keep tripState intact
    parser.setCustomGeminiGenerator(async () => '{ malformed json !!!');
    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Nhóm đổi thành 6 người',
        clientMessageId: 'msg-bad-json',
      }),
    ).rejects.toThrow(HttpException);
    parser.setCustomGeminiGenerator(undefined);

    // Verify tripState in DB is still intact (Yên Tử, 1 day, 4 travelers)
    const detailAfterError = await aiService.getConversationById(
      conv.id,
      user1Id,
    );
    expect(detailAfterError.tripState.destination).toBe('Yên Tử');
    expect(detailAfterError.tripState.durationDays).toBe(1);
    expect(detailAfterError.tripState.travelers).toBe(4);
  });

  // =========================================================================
  // 6. OWNERSHIP AUTHORIZATION (SECOND ACCOUNT BLOCKED)
  // =========================================================================
  it('blocks a second account from viewing or sending messages to the first account conversation', async () => {
    const conv = await aiService.createConversation(user1Id, {
      initialMessage: 'Tôi muốn trekking Yên Tử',
      clientMessageId: 'owner-init-1',
    });

    // User 2 tries to get conversation detail
    await expect(
      aiService.getConversationById(conv.id, user2Id),
    ).rejects.toThrow(ForbiddenException);

    // User 2 tries to read message history
    await expect(
      aiService.getConversationMessages(conv.id, user2Id),
    ).rejects.toThrow(ForbiddenException);

    // User 2 tries to send a message
    await expect(
      aiService.sendMessage(conv.id, user2Id, {
        content: 'Can thiệp trái phép',
        clientMessageId: 'attacker-msg-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // =========================================================================
  // 7. EXPLICIT FIELD CLEARING, OWNED GEAR, BUDGET & AMBIGUOUS DATE HANDLING
  // =========================================================================
  it('distinguishes unmentioned fields from explicit field clearing and asks for clarification on ambiguous dates', async () => {
    const conv = await aiService.createConversation(user1Id, {});

    // Turn 1: provide destination, activity, duration, travelers, budget, and owned gear
    const turn1 = await aiService.sendMessage(conv.id, user1Id, {
      content:
        'Tôi muốn trekking Yên Tử ngày 15/11/2026, đi 1 ngày, nhóm 4 người, đã có balo và áo khoác, ngân sách 300.000 đồng',
      clientMessageId: 'clear-test-1',
    });

    expect(turn1.tripState.destination).toBe('Yên Tử');
    expect(turn1.tripState.departureDate).toBe('2026-11-15');
    expect(turn1.tripState.budgetVnd).toBe(300000);
    expect(turn1.tripState.ownedGear).toEqual(
      expect.arrayContaining(['BACKPACK', 'RAIN_JACKET']),
    );

    // Turn 2: Explicitly clear budget and departure date while keeping destination & travelers
    const turn2 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Xóa ngân sách và chưa chốt ngày đi nhé',
      clientMessageId: 'clear-test-2',
    });

    expect(turn2.tripState.destination).toBe('Yên Tử');
    expect(turn2.tripState.travelers).toBe(4);
    expect(turn2.tripState.budgetVnd).toBeNull();
    expect(turn2.tripState.departureDate).toBeNull();

    // Turn 3: Ambiguous date expression -> keeps departureDate null and asks for clarification
    const turn3 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Dự kiến đi vào tháng sau',
      clientMessageId: 'clear-test-3',
    });

    expect(turn3.tripState.departureDate).toBeNull();
    expect(turn3.reply).toContain('ngày dự kiến cụ thể');
  });

  // =========================================================================
  // 8. STRUCTURED CHECKLIST CHAT UPDATES, TYPO TOLERANCE, IDEMPOTENCY & RELOAD
  // =========================================================================
  it('accurately parses and applies structured checklist operations on a single conversation (2 tents, 4 chairs) and persists across reload', async () => {
    const conv = await aiService.createConversation(user1Id, {});

    // Turn 1: Start a 4-person, 2-day camping trip -> requires 2 tents (SHARED_2_3) and 4 camping chairs (PER_PERSON)
    const turn1 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Nhóm 4 người muốn đi cắm trại Hồ Trị An 2 ngày',
      clientMessageId: 'cl-chat-1',
    });

    expect(turn1.status).toBe('READY_FOR_CHECKLIST');
    const getEntry = (items: any[], code: string) =>
      items.find((i: any) => i.categoryCode === code);

    expect(getEntry(turn1.checklistPreview, 'TENT')).toMatchObject({
      categoryCode: 'TENT',
      quantityRequired: 2,
      quantityOwned: 0,
      quantityMissing: 2,
    });
    expect(getEntry(turn1.checklistPreview, 'CAMPING_CHAIR')).toMatchObject({
      categoryCode: 'CAMPING_CHAIR',
      quantityRequired: 4,
      quantityOwned: 0,
      quantityMissing: 4,
    });

    // Turn 2: "nhóm đã có 1 lều" -> SET_OWNED(TENT, 1) -> 2 / 1 / 1
    const parsedTurn2 = await parser.parseUserTurn(
      'nhóm đã có 1 lều',
      turn1.tripState,
    );
    expect(parsedTurn2.checklistOperations).toEqual([
      expect.objectContaining({
        intent: 'SET_OWNED',
        categoryCode: 'TENT',
        quantity: 1,
      }),
    ]);

    const turn2 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'nhóm đã có 1 lều',
      clientMessageId: 'cl-chat-2',
    });
    expect(turn2.tripState.ownedGearQuantities?.TENT).toBe(1);
    expect(getEntry(turn2.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
      userEditedOwned: true,
    });
    // Unmentioned chair remains 4 / 0 / 4
    expect(getEntry(turn2.checklistPreview, 'CAMPING_CHAIR')).toMatchObject({
      quantityRequired: 4,
      quantityOwned: 0,
      quantityMissing: 4,
    });
    expect(turn2.reply).toContain('cần chuẩn bị **2**');
    expect(turn2.reply).toContain('đã có **1**');
    expect(turn2.reply).toContain('còn thiếu **1**');

    // Turn 3: "nhóm thiếu 1 lều" -> SET_MISSING(TENT, 1) -> when required=2, sets owned=1, missing=1 (remains 2 / 1 / 1)
    const parsedTurn3 = await parser.parseUserTurn(
      'nhóm thiếu 1 lều',
      turn2.tripState,
    );
    expect(parsedTurn3.checklistOperations).toEqual([
      expect.objectContaining({
        intent: 'SET_MISSING',
        categoryCode: 'TENT',
        quantity: 1,
      }),
    ]);

    const turn3 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'nhóm thiếu 1 lều',
      clientMessageId: 'cl-chat-3',
    });
    expect(getEntry(turn3.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });

    // Turn 4: "ghế xếp đã có 2 cáu" (typo "cáu" for "cái") -> SET_OWNED(CAMPING_CHAIR, 2) -> chair 4 / 2 / 2, tent stays 2 / 1 / 1
    const parsedTurn4 = await parser.parseUserTurn(
      'ghế xếp đã có 2 cáu',
      turn3.tripState,
    );
    expect(parsedTurn4.checklistOperations).toEqual([
      expect.objectContaining({
        intent: 'SET_OWNED',
        categoryCode: 'CAMPING_CHAIR',
        quantity: 2,
      }),
    ]);

    const turn4 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'ghế xếp đã có 2 cáu',
      clientMessageId: 'cl-chat-4',
    });
    expect(getEntry(turn4.checklistPreview, 'CAMPING_CHAIR')).toMatchObject({
      quantityRequired: 4,
      quantityOwned: 2,
      quantityMissing: 2,
      userEditedOwned: true,
    });
    expect(getEntry(turn4.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });

    // Turn 5: "có thêm 1 lều" -> INCREMENT_OWNED(TENT, 1) -> tent 2 / 2 / 0
    const turn5 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'có thêm 1 lều',
      clientMessageId: 'cl-chat-5-inc',
    });
    expect(getEntry(turn5.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 2,
      quantityMissing: 0,
    });

    // Retry Turn 5 with the exact same clientMessageId -> idempotent, must NOT increment to 3!
    const turn5Retry = await aiService.sendMessage(conv.id, user1Id, {
      content: 'có thêm 1 lều',
      clientMessageId: 'cl-chat-5-inc',
    });
    expect(turn5Retry.deduplicated).toBe(true);
    expect(getEntry(turn5Retry.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 2,
      quantityMissing: 0,
    });

    // Turn 6: "bớt 1 lều đã có" -> DECREMENT_OWNED(TENT, 1) -> tent 2 / 1 / 1
    const turn6 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'bớt 1 lều đã có',
      clientMessageId: 'cl-chat-6-dec-owned',
    });
    expect(getEntry(turn6.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });

    // Turn 7: "bớt 1 lều" (ambiguous) -> AMBIGUOUS_DECREMENT -> asks clarification without mutating tent
    const turn7 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'bớt 1 lều',
      clientMessageId: 'cl-chat-7-ambiguous',
    });
    expect(getEntry(turn7.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });
    expect(turn7.reply).toContain('số lượng cần chuẩn bị');
    expect(turn7.reply).toContain('số lượng nhóm đã có');

    // Turn 8: "nhóm cần 3 lều" -> SET_REQUIRED(TENT, 3) -> tent 3 / 1 / 2
    const turn8 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'nhóm cần 3 lều',
      clientMessageId: 'cl-chat-8-set-req',
    });
    expect(getEntry(turn8.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
      userEditedRequired: true,
    });

    // Turn 9: "thêm 1 tấm bạt vào checklist" -> ADD_ITEM(TARP, 1) -> tarp 1 / 0 / 1
    const turn9 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'thêm 1 tấm bạt vào checklist',
      clientMessageId: 'cl-chat-9-add-tarp',
    });
    expect(getEntry(turn9.checklistPreview, 'TARP')).toMatchObject({
      categoryCode: 'TARP',
      quantityRequired: 1,
      quantityOwned: 0,
      quantityMissing: 1,
      isCustomItem: true,
    });
    expect(getEntry(turn9.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
    });

    // Turn 10: "bỏ ghế xếp khỏi checklist" -> REMOVE_ITEM(CAMPING_CHAIR) -> removed from checklistPreview
    const turn10 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'bỏ ghế xếp khỏi checklist',
      clientMessageId: 'cl-chat-10-remove-chair',
    });
    expect(getEntry(turn10.checklistPreview, 'CAMPING_CHAIR')).toBeUndefined();
    expect(getEntry(turn10.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
    });
    expect(getEntry(turn10.checklistPreview, 'TARP')).toMatchObject({
      quantityRequired: 1,
      quantityOwned: 0,
      quantityMissing: 1,
    });

    // Turn 11: "đã có đèn đội đầu" (unspecified quantity) -> ASK_OWNED_QUANTITY -> does NOT set quantityOwned = quantityRequired
    const turn11 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'đã có đèn đội đầu',
      clientMessageId: 'cl-chat-11-ask-qty',
    });
    expect(getEntry(turn11.checklistPreview, 'HEADLAMP')).toMatchObject({
      quantityRequired: 4,
      quantityOwned: 0,
      quantityMissing: 4,
      ownedConfirmed: false,
    });
    expect(turn11.reply).toContain('Nhóm đã có bao nhiêu');

    // Page reload verification: getConversationById & getConversationMessages preserve exact checklist state
    const reloaded = await aiService.getConversationById(conv.id, user1Id);
    expect(getEntry(reloaded.checklistPreview, 'TENT')).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
    });
    expect(getEntry(reloaded.checklistPreview, 'TARP')).toMatchObject({
      quantityRequired: 1,
      quantityOwned: 0,
      quantityMissing: 1,
    });
    expect(getEntry(reloaded.checklistPreview, 'CAMPING_CHAIR')).toBeUndefined();
  });
});
