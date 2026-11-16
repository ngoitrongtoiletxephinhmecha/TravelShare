import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AiService } from './ai.service';
import { TripRequirementParser } from './trip-requirement.parser';
import { TripStateValidator } from './trip-state.validator';
import {
  ActivityType,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
} from '../../common/enums/system.enums';
import { ChecklistsService } from '../checklists/checklists.service';
import { AvailabilityService } from '../gear/availability.service';
import { migrateLegacyBeachCampingData } from '../../database/migrate-activity-types';

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
        if (key === 'gemini.model') return 'gemini-3.5-flash';
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
        if (
          !existing ||
          (filter.stateVersion !== undefined &&
            existing.stateVersion !== filter.stateVersion)
        ) {
          return makeChainable(null);
        }
        if (update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
          aiConversationsStore.set(String(existing._id), existing);
        }
        return makeChainable(existing);
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
      deleteOne: jest.fn().mockImplementation((filter: any) => {
        if (filter?._id) {
          aiMessagesStore.delete(String(filter._id));
        }
        return Promise.resolve({ deletedCount: 1 });
      }),
    };

    const mockTravelPlanModel: any = {
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(travelPlansStore.get(String(id)) || null);
      }),
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
      deleteOne: jest.fn().mockImplementation((filter: any) => {
        if (filter?._id) {
          travelPlansStore.delete(String(filter._id));
        }
        return Promise.resolve({ deletedCount: 1 });
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
        const doc = checklistsStore.get(String(id));
        if (!doc) return makeChainable(null);
        return makeChainable({
          ...doc,
          items: Array.isArray(doc.items)
            ? doc.items.map((it: any) => ({ ...it }))
            : [],
          removedItemCodes: Array.isArray(doc.removedItemCodes)
            ? [...doc.removedItemCodes]
            : [],
          versionHistory: Array.isArray(doc.versionHistory)
            ? doc.versionHistory.map((h: any) => ({ ...h }))
            : [],
        });
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = checklistsStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set);
          checklistsStore.set(String(id), existing);
        }
        return makeChainable(existing || null);
      }),
      deleteOne: jest.fn().mockImplementation((filter: any) => {
        if (filter?._id) {
          checklistsStore.delete(String(filter._id));
        }
        return Promise.resolve({ deletedCount: 1 });
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

  // =========================================================================
  // 9. PHASE 9A: BA VÌ FLOW — DESTINATION QA, CHECKLIST READS, COMBINED TURNS & PRINT RULE
  // =========================================================================
  it('handles Phase 9A Ba Vì flow: Destination QA ("ở đó") & Checklist read queries preserve checklistVersion, combined turns work, and full checklist only prints when created or requested', async () => {
    const conv = await aiService.createConversation(user1Id, {});

    // Turn 1: Set up Ba Vì camping 2 days, 4 travelers -> generates checklist v1 & prints initial preview
    const turn1 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn cắm trại ở Ba Vì 2 ngày, nhóm 4 người',
      clientMessageId: 'bavi-9a-1',
    });
    expect(turn1.status).toBe('READY_FOR_CHECKLIST');
    expect(turn1.tripState.destination).toBe('Vườn Quốc gia Ba Vì');
    expect(turn1.reply).toContain('Checklist hiện tại');

    const checklistId = String(turn1.conversation.checklistId);
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(1);

    // Turn 2: Pure DESTINATION_QA ("Giới thiệu ngắn gọn về Ba Vì") -> answers QA, does NOT bump checklistVersion, does NOT print full checklist
    const turn2Qa = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Giới thiệu ngắn gọn về Ba Vì',
      clientMessageId: 'bavi-9a-2-qa',
    });
    expect(turn2Qa.tripState.destination).toBe('Vườn Quốc gia Ba Vì');
    expect(turn2Qa.reply).toContain('Ba Vì');
    expect(turn2Qa.reply).not.toContain('Checklist hiện tại');
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(1);

    // Turn 3: Follow-up coreference QA ("Ở đó có gì nổi bật?") -> uses saved destination Ba Vì, keeps checklistVersion = 1
    const turn3Coref = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Ở đó có gì nổi bật?',
      clientMessageId: 'bavi-9a-3-coref',
    });
    expect(turn3Coref.reply).toMatch(/Đỉnh Vua|Nhà thờ cổ|rừng thông/i);
    expect(turn3Coref.tripState.destination).toBe('Vườn Quốc gia Ba Vì');
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(1);

    // Turn 4: "Nhóm đã có 1 lều" -> updates TENT 2/1/1, bumps checklistVersion to 2, concise confirmation only (no full checklist dump)
    const turn4Tent = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Nhóm đã có 1 lều',
      clientMessageId: 'bavi-9a-4-tent',
    });
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(2);
    expect(turn4Tent.checklistPreview.find((i: any) => i.categoryCode === 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });
    expect(turn4Tent.reply).toContain('còn thiếu **1**');
    expect(turn4Tent.reply).not.toContain('Checklist hiện tại');

    // Turn 5: "Còn thiếu mấy lều?" -> CHECKLIST_ITEM_READ reads saved checklist -> còn thiếu 1, NO mutation, checklistVersion stays 2!
    const turn5Read = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Còn thiếu mấy lều?',
      clientMessageId: 'bavi-9a-5-read',
    });
    expect(turn5Read.reply).toContain('còn thiếu 1');
    expect(turn5Read.reply).not.toContain('Đã cập nhật');
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(2);
    expect(turn5Read.checklistPreview.find((i: any) => i.categoryCode === 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });

    // Turn 6: Combined turn -> realtime QA disclaimer + "ghế xếp đã có 2 cáu"
    const turn6Combined = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Thời tiết Ba Vì hôm nay thế nào? À ghế xếp đã có 2 cáu',
      clientMessageId: 'bavi-9a-6-combined',
    });
    expect(turn6Combined.reply).toContain('thời gian thực');
    expect(turn6Combined.reply).toContain('còn thiếu **2**');
    expect(
      turn6Combined.checklistPreview.find(
        (i: any) => i.categoryCode === 'CAMPING_CHAIR',
      ),
    ).toMatchObject({
      quantityRequired: 4,
      quantityOwned: 2,
      quantityMissing: 2,
    });
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(3);

    // Turn 7: Explicit checklist view ("Xem checklist") -> prints full checklist without mutating version
    const turn7View = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Xem checklist',
      clientMessageId: 'bavi-9a-7-view',
    });
    expect(turn7View.reply).toContain('Checklist hiện tại');
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(3);
  });

  // =========================================================================
  // 10. PHASE 9A: ABORT SIGNAL ON TIMEOUT, 404/429/INVALID_SCHEMA, SAFE FALLBACK & ROLLBACK
  // =========================================================================
  it('aborts hung Gemini calls via AbortSignal, handles 404/429/TIMEOUT/INVALID_SCHEMA, falls back safely, and rolls back partial failures', async () => {
    const conv = await aiService.createConversation(user1Id, {
      initialMessage: 'Tôi muốn cắm trại Ba Vì 2 ngày, nhóm 4 người',
      clientMessageId: 'resil-init-1',
    });

    // 1. Explicit simulated errors: NOT_FOUND (404), QUOTA_EXCEEDED (429), TIMEOUT, INVALID_SCHEMA
    for (const sim of [
      'NOT_FOUND',
      'QUOTA_EXCEEDED',
      'TIMEOUT',
      'INVALID_SCHEMA',
    ] as const) {
      await expect(
        aiService.sendMessage(conv.id, user1Id, {
          content: 'Nhóm đổi thành 8 người',
          clientMessageId: `resil-sim-${sim}`,
          simulateError: sim,
        }),
      ).rejects.toThrow(HttpException);
    }
    expect((await aiService.getConversationById(conv.id, user1Id)).tripState.travelers).toBe(4);

    // 2. Real AbortController timeout check via slow customGenerator & short timeoutMs
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'gemini.apiKey') return 'fake-key-for-test';
      if (key === 'gemini.model') return 'gemini-3.5-flash';
      if (key === 'gemini.timeoutMs') return 40;
      return undefined;
    });

    let observedSignal: AbortSignal | undefined;
    parser.setCustomGeminiGenerator(async (_prompt, signal) => {
      observedSignal = signal;
      return new Promise((_resolve) => {
        // Never resolves within 40ms
      });
    });

    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Nhóm đổi thành 6 người',
        clientMessageId: 'resil-abort-timeout',
      }),
    ).rejects.toThrow(HttpException);
    expect(observedSignal?.aborted).toBe(true);

    // 3. Mocked 404 & 429 with fallback enabled: only clear updates apply; unrecognized questions preserve state
    parser.setCustomGeminiGenerator(
      async () => {
        const err: any = new Error('404 models/gemini-3.5-flash is not found');
        err.status = 404;
        throw err;
      },
      { allowFallbackOnError: true },
    );

    // Clear checklist mutation still succeeds via safe fallback
    const fallbackMutation = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Nhóm đã có 1 lều',
      clientMessageId: 'resil-fallback-tent',
    });
    expect(
      fallbackMutation.checklistPreview.find((i: any) => i.categoryCode === 'TENT'),
    ).toMatchObject({ quantityOwned: 1, quantityMissing: 1 });

    // Unrecognized general question during 429/404 fallback leaves tripState & checklistVersion completely unchanged
    const checklistId = String(fallbackMutation.conversation.checklistId);
    const verBeforeUnknown = checklistsStore.get(checklistId)?.checklistVersion;

    const fallbackUnknown = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Chính sách hoàn tiền thuê thiết bị bên bạn ra sao?',
      clientMessageId: 'resil-fallback-unknown',
    });
    expect(fallbackUnknown.reply).toContain('giữ nguyên');
    expect(checklistsStore.get(checklistId)?.checklistVersion).toBe(verBeforeUnknown);
    expect(fallbackUnknown.tripState.travelers).toBe(4);
    parser.setCustomGeminiGenerator(undefined);

    // 4. Atomic compensating rollback when conversation CAS fails mid-turn ("có thêm 1 lều" must NOT stick if CAS conflicts)
    const convDoc = aiConversationsStore.get(conv.id);
    const msgsBeforeCas = aiMessagesStore.size;
    // Spy on checklistModel.findByIdAndUpdate once to simulate another tab concurrently bumping stateVersion
    const checklistsModelSpy = (aiService as any).checklistModel;
    const realChecklistUpdate = checklistsModelSpy.findByIdAndUpdate;
    const casSpy = jest
      .spyOn(checklistsModelSpy, 'findByIdAndUpdate')
      .mockImplementationOnce((id: any, update: any) => {
        convDoc.stateVersion = convDoc.stateVersion + 5;
        return realChecklistUpdate(id, update);
      });

    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Có thêm 1 lều',
        clientMessageId: 'resil-cas-rollback',
      }),
    ).rejects.toThrow(ConflictException);

    // Verify rolled back: message count unchanged and TENT owned is STILL 1 (not 2)!
    expect(aiMessagesStore.size).toBe(msgsBeforeCas);
    expect(
      checklistsStore
        .get(checklistId)
        ?.items?.find((i: any) => i.categoryCode === 'TENT')?.quantityOwned,
    ).toBe(1);
  });

  // =========================================================================
  // 11. PHASE 9A SECTION 5 ACCEPTANCE: CONVERSATIONAL FLOWS, COREFERENCE "Ở ĐÓ",
  //     NATURAL QUANTITY PATTERNS, PRE-CHECKLIST OVERRIDES & ERROR ISOLATION
  // =========================================================================
  it('satisfies all Phase 9A conversational, QA coreference, natural quantity, and resilience acceptance criteria', async () => {
    const convChat = await aiService.createConversation(user1Id, {});

    // Scenario 1: Greetings & thanks stay conversational without pushing questionnaire or mutating plan
    const greetTurn = await aiService.sendMessage(convChat.id, user1Id, {
      content: 'Chào bạn',
      clientMessageId: 'p9a-s1-greet',
    });
    expect(greetTurn.tripState.destination).toBeNull();
    expect(greetTurn.tripState.activity).toBeNull();
    expect(greetTurn.conversation.checklistId).toBeNull();
    expect(greetTurn.reply).toContain('Chào bạn');
    expect(greetTurn.reply).not.toContain('Checklist hiện tại');

    const thanksTurn = await aiService.sendMessage(convChat.id, user1Id, {
      content: 'Cảm ơn',
      clientMessageId: 'p9a-s1-thanks',
    });
    expect(thanksTurn.tripState.destination).toBeNull();
    expect(thanksTurn.tripState.activity).toBeNull();

    // Scenario 2: Destination QA ("Giới thiệu Ba Vì" -> "Ở đó có gì nổi bật?") uses recent conversation context without saving destination prematurely
    const baviIntro = await aiService.sendMessage(convChat.id, user1Id, {
      content: 'Giới thiệu Ba Vì',
      clientMessageId: 'p9a-s2-intro',
    });
    expect(baviIntro.tripState.destination).toBeNull();
    expect(baviIntro.reply).toContain('Ba Vì');

    const baviFollowup = await aiService.sendMessage(convChat.id, user1Id, {
      content: 'Ở đó có gì nổi bật?',
      clientMessageId: 'p9a-s2-there',
    });
    expect(baviFollowup.tripState.destination).toBeNull();
    expect(baviFollowup.reply).toContain('Ba Vì');

    // Scenario 3: Multi-intent ("Giới thiệu Ba Vì, mình muốn đi ở đó") saves Ba Vì WITHOUT auto-assigning TREKKING
    const convNoAutoTrek = await aiService.createConversation(user1Id, {});
    const mixedStart = await aiService.sendMessage(convNoAutoTrek.id, user1Id, {
      content: 'Giới thiệu Ba Vì, mình muốn đi ở đó',
      clientMessageId: 'p9a-s3-mixed',
    });
    expect(mixedStart.reply).toContain('Ba Vì');
    expect(mixedStart.tripState.destination).toBe('Vườn Quốc gia Ba Vì');
    expect(mixedStart.tripState.activity).toBeNull();
    expect(mixedStart.conversation.title).not.toContain('Trekking');

    // Itinerary advice ("Lập lịch trình tham quan Ba Vì 2 ngày") distinguishes saved plan vs chat-only itinerary
    const itineraryTurn = await aiService.sendMessage(convNoAutoTrek.id, user1Id, {
      content: 'Lập lịch trình tham quan Ba Vì 2 ngày',
      clientMessageId: 'p9a-s3-itinerary',
    });
    expect(itineraryTurn.tripState.durationDays).toBe(2);
    expect(itineraryTurn.reply).toContain('lịch trình');
    expect(itineraryTurn.reply).toContain('tham khảo');

    // "Đi Yên Tử cần mang gì?" gives preliminary gear tips and asks missing field
    const convYenTu = await aiService.createConversation(user1Id, {});
    const yenTuTip = await aiService.sendMessage(convYenTu.id, user1Id, {
      content: 'Đi Yên Tử cần mang gì?',
      clientMessageId: 'p9a-yentu-tip',
    });
    expect(yenTuTip.tripState.destination).toBe('Yên Tử');
    expect(yenTuTip.tripState.activity).toBeNull();
    expect(yenTuTip.reply).toContain('Gợi ý đồ chuẩn bị sơ bộ');

    // Scenario 4 & 5: Natural Vietnamese quantity patterns, ordering rules, clientMessageId idempotency & persistence
    const convQty = await aiService.createConversation(user1Id, {});

    // Pre-checklist manual override before trip info is complete -> persisted across unrelated turn & applied on creation
    const preReq = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Balo mình muốn 2 cái',
      clientMessageId: 'p9a-s4-pre-req',
    });
    expect(preReq.tripState.requiredGearQuantities?.BACKPACK).toBe(2);

    const tripStart = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Cắm trại Ba Vì 1 ngày 3 người',
      clientMessageId: 'p9a-s4-create',
    });
    expect(tripStart.status).toBe('READY_FOR_CHECKLIST');
    const clId = String(tripStart.conversation.checklistId);

    // "Tăng số lượng balo lên là 3" -> SET_REQUIRED(3)
    const setReq3 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Tăng số lượng balo lên là 3',
      clientMessageId: 'p9a-s5-set3',
    });
    expect(
      setReq3.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK'),
    ).toMatchObject({ quantityRequired: 3, userEditedRequired: true });

    // "Thêm 2 balo" -> INCREMENT_REQUIRED(+2) => 5
    const incReq2 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Thêm 2 balo',
      clientMessageId: 'p9a-s5-inc2',
    });
    expect(
      incReq2.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK'),
    ).toMatchObject({ quantityRequired: 5, userEditedRequired: true });

    // Retry same clientMessageId -> must NOT double-increment to 7
    const incReq2Retry = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Thêm 2 balo',
      clientMessageId: 'p9a-s5-inc2',
    });
    expect(incReq2Retry.deduplicated).toBe(true);
    expect(
      incReq2Retry.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK')
        ?.quantityRequired,
    ).toBe(5);

    // "Nhóm đã có 2 balo" -> owned = 2, then "Nhóm có thêm 2 balo rồi" -> owned = 4, missing = 1
    await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Nhóm đã có 2 balo',
      clientMessageId: 'p9a-s5-owned2',
    });
    const incOwned2 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Nhóm có thêm 2 balo rồi',
      clientMessageId: 'p9a-s5-incowned2',
    });
    expect(
      incOwned2.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK'),
    ).toMatchObject({
      quantityRequired: 5,
      quantityOwned: 4,
      quantityMissing: 1,
    });

    // "Mình muốn 3 người thì có 3 cái balo" -> travelers=3 + BACKPACK quantityRequired=3
    const sameTurnThree = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Mình muốn 3 người thì có 3 cái balo',
      clientMessageId: 'p9a-s5-3pax3bag',
    });
    expect(sameTurnThree.tripState.travelers).toBe(3);
    expect(
      sameTurnThree.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK'),
    ).toMatchObject({
      quantityRequired: 3,
      userEditedRequired: true,
    });

    // "À mình muốn 3 người nhưng chỉ dùng 1 balo thôi" -> rule sets 3, manual override sets 1
    const overrideOne = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'À mình muốn 3 người nhưng chỉ dùng 1 balo thôi',
      clientMessageId: 'p9a-s5-override1',
    });
    expect(overrideOne.tripState.travelers).toBe(3);
    expect(
      overrideOne.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK'),
    ).toMatchObject({
      quantityRequired: 1,
      userEditedRequired: true,
    });

    // Updating unrelated field (duration -> 2 days) preserves manual override quantityRequired = 1 across regeneration & reload
    const changeDuration = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Đổi thành 2 ngày',
      clientMessageId: 'p9a-s5-dur2',
    });
    expect(
      changeDuration.checklistPreview.find(
        (i: any) => i.categoryCode === 'BACKPACK',
      ),
    ).toMatchObject({
      quantityRequired: 1,
      userEditedRequired: true,
    });

    // Reload conversation & confirm persistence
    const reloadedQty = await aiService.getConversationMessages(
      convQty.id,
      user1Id,
      {
        limit: 40,
      },
    );
    expect(
      reloadedQty.conversation.checklistPreview.find(
        (i: any) => i.categoryCode === 'BACKPACK',
      )?.quantityRequired,
    ).toBe(1);

    // "Thêm 1 tấm bạt" without "vào checklist" -> adds TARP = 1
    const addTarpTurn = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Thêm 1 tấm bạt',
      clientMessageId: 'p9a-s5-addtarp',
    });
    expect(
      addTarpTurn.checklistPreview.find((i: any) => i.categoryCode === 'TARP'),
    ).toMatchObject({ quantityRequired: 1 });

    // "Bớt 1 balo" -> ambiguous -> asks clarification and does NOT change quantity
    const ambigBalos = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Bớt 1 balo',
      clientMessageId: 'p9a-s5-ambig',
    });
    expect(ambigBalos.reply).toContain('số lượng cần chuẩn bị');
    expect(
      ambigBalos.checklistPreview.find((i: any) => i.categoryCode === 'BACKPACK')
        ?.quantityRequired,
    ).toBe(1);

    // Scenario 6: Read queries ("Còn thiếu mấy balo?") & General Q&A ("Balo trekking khác balo thường thế nào?") do NOT bump checklistVersion
    const verBeforeReadAndQa = checklistsStore.get(clId)?.checklistVersion;

    const readBalo = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Còn thiếu mấy balo?',
      clientMessageId: 'p9a-s6-readbalo',
    });
    expect(readBalo.reply).toContain('Balo');
    expect(checklistsStore.get(clId)?.checklistVersion).toBe(verBeforeReadAndQa);

    const generalCompare = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Balo trekking khác balo thường thế nào?',
      clientMessageId: 'p9a-s6-compare',
    });
    expect(generalCompare.reply.toLowerCase()).toContain('khung trợ lực');
    expect(checklistsStore.get(clId)?.checklistVersion).toBe(verBeforeReadAndQa);

    // Scenario 7: When Gemini throws 404/TIMEOUT, greetings & checklist commands STILL work cleanly,
    // and open-ended provider-dependent Q&A gives a clear retry message WITHOUT combined fallback text
    parser.setCustomGeminiGenerator(
      async () => {
        const err: any = new Error('404 models/gemini-3.5-flash is not found');
        err.status = 404;
        throw err;
      },
      { allowFallbackOnError: true },
    );

    const greetUnder404 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Chào bạn',
      clientMessageId: 'p9a-s7-greet404',
    });
    expect(greetUnder404.reply).toContain('Chào bạn');
    expect(greetUnder404.reply).not.toContain('Gemini lỗi hoặc chưa hiểu');

    const cmdUnder404 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Bỏ ghế xếp khỏi checklist',
      clientMessageId: 'p9a-s7-remchair404',
    });
    expect(
      cmdUnder404.checklistPreview.find(
        (i: any) => i.categoryCode === 'CAMPING_CHAIR',
      ),
    ).toBeUndefined();

    const openQaUnder404 = await aiService.sendMessage(convQty.id, user1Id, {
      content: 'Kinh nghiệm chọn bếp cồn đi rừng?',
      clientMessageId: 'p9a-s7-open404',
    });
    expect(openQaUnder404.reply).toContain('404');
    expect(openQaUnder404.reply).not.toContain('chưa hiểu yêu cầu');

    parser.setCustomGeminiGenerator(undefined);
  });

  // =========================================================================
  // 8. PHASE 10 — ACTIVITY ENUM OVERHAUL, CONTEXTUAL INTENT & CHECKLIST/RENTAL FLOWS
  // =========================================================================
  it('Scenario 1: distinguishes BEACH, coastal overnight CAMPING, SIGHTSEEING, and keeps activity=null on generic destination', async () => {
    // 1a: "Tôi muốn đi biển Cát Bà" -> destination Cát Bà, activity BEACH
    const convBeach = await aiService.createConversation(user1Id, {});
    const resBeach = await aiService.sendMessage(convBeach.id, user1Id, {
      content: 'Tôi muốn đi biển Cát Bà',
      clientMessageId: 'p10-s1-beach',
    });
    expect(resBeach.tripState.destination).toBe('Cát Bà');
    expect(resBeach.tripState.activity).toBe(ActivityType.BEACH);
    expect(resBeach.tripState.environment).toBe('COASTAL');

    // 1b: "Nhóm mình muốn cắm trại qua đêm ở bãi biển Cát Bà" -> CAMPING + COASTAL + isOvernight
    const convCoastCamp = await aiService.createConversation(user1Id, {});
    const resCoastCamp = await aiService.sendMessage(convCoastCamp.id, user1Id, {
      content: 'Nhóm mình muốn cắm trại qua đêm ở bãi biển Cát Bà',
      clientMessageId: 'p10-s1-coast-camp',
    });
    expect(resCoastCamp.tripState.destination).toBe('Cát Bà');
    expect(resCoastCamp.tripState.activity).toBe(ActivityType.CAMPING);
    expect(resCoastCamp.tripState.environment).toBe('COASTAL');
    expect(resCoastCamp.tripState.isOvernight).toBe(true);

    // 1c: "Mình đi Cát Bà để tham quan các địa điểm" -> SIGHTSEEING
    const convSight = await aiService.createConversation(user1Id, {});
    const resSight = await aiService.sendMessage(convSight.id, user1Id, {
      content: 'Mình đi Cát Bà để tham quan các địa điểm',
      clientMessageId: 'p10-s1-sight',
    });
    expect(resSight.tripState.destination).toBe('Cát Bà');
    expect(resSight.tripState.activity).toBe(ActivityType.SIGHTSEEING);

    // 1d: "Tôi muốn đi Cát Bà" -> activity stays null, asks clarification
    const convGeneric = await aiService.createConversation(user1Id, {});
    const resGeneric = await aiService.sendMessage(convGeneric.id, user1Id, {
      content: 'Tôi muốn đi Cát Bà',
      clientMessageId: 'p10-s1-generic',
    });
    expect(resGeneric.tripState.destination).toBe('Cát Bà');
    expect(resGeneric.tripState.activity).toBeNull();
  });

  it('Scenario 2: normalizes legacy BEACH_CAMPING conversations cleanly and runs idempotent migration (--dry-run vs --apply)', async () => {
    const convId = new Types.ObjectId();
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Cát Bà',
      activity: 'BEACH_CAMPING',
      durationDays: 2,
      travelers: 4,
      ownedGearCodes: ['TENT'],
      ownedGearQuantities: { TENT: 1 },
      planVersion: 1,
    });
    aiConversationsStore.set(String(convId), {
      _id: convId,
      userId: new Types.ObjectId(user1Id),
      title: 'Cắm trại biển Cát Bà',
      status: 'READY_FOR_CHECKLIST',
      stateVersion: 3,
      linkedTravelPlanId: planId,
      tripState: {
        destination: 'Cát Bà',
        activity: 'BEACH_CAMPING',
        durationDays: 2,
        travelers: 4,
        ownedGearCodes: ['TENT'],
        ownedGearQuantities: { TENT: 1 },
      },
      parsedRequirements: {
        destination: 'Cát Bà',
        activity: 'BEACH_CAMPING',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loaded = await aiService.getConversationById(String(convId), user1Id);
    expect(loaded.tripState.activity).toBe(ActivityType.CAMPING);
    expect(loaded.tripState.environment).toBe('COASTAL');
    expect(loaded.tripState.ownedGearQuantities).toEqual({ TENT: 1 });

    // Unit test migrateLegacyBeachCampingData dry-run and apply idempotency
    const fakeCollections: Record<string, any[]> = {
      ai_conversations: [
        {
          _id: convId,
          tripState: { destination: 'Cát Bà', activity: 'BEACH_CAMPING', ownedGearQuantities: { TENT: 1 } },
          parsedRequirements: { destination: 'Cát Bà', activity: 'BEACH_CAMPING' },
        },
      ],
      travel_plans: [
        { _id: planId, destination: 'Cát Bà', activity: 'BEACH_CAMPING', ownedGearQuantities: { TENT: 1 } },
      ],
      gear_rules: [
        { _id: new Types.ObjectId(), activity: 'BEACH_CAMPING', items: [] },
      ],
      communities: [
        { _id: new Types.ObjectId(), activityType: 'BEACH_CAMPING' },
      ],
      posts: [
        { _id: new Types.ObjectId(), activityType: 'BEACH_CAMPING' },
      ],
    };

    const mockDb: any = {
      collection: (name: string) => {
        const docs = fakeCollections[name] || [];
        return {
          find: () => ({ toArray: async () => docs }),
          findOne: async (filter: any) =>
            docs.find((d) =>
              Object.entries(filter || {}).every(([k, v]) => d[k] === v),
            ) || null,
          deleteOne: async (filter: any) => {
            const idx = docs.findIndex((d) => String(d._id) === String(filter._id));
            if (idx >= 0) docs.splice(idx, 1);
            return { deletedCount: idx >= 0 ? 1 : 0 };
          },
          updateOne: async (filter: any, update: any) => {
            const target = docs.find((d) => String(d._id) === String(filter._id));
            if (target && update.$set) {
              Object.entries(update.$set).forEach(([k, v]) => {
                if (k === 'tripState') target.tripState = v;
                else if (k === 'parsedRequirements') target.parsedRequirements = v;
                else target[k] = v;
              });
            }
            return { modifiedCount: target ? 1 : 0 };
          },
        };
      },
    };

    const preview = await migrateLegacyBeachCampingData(mockDb, { dryRun: true });
    expect(preview.dryRun).toBe(true);
    expect(preview.aiConversationsUpdated).toBe(1);
    expect(preview.travelPlansUpdated).toBe(1);
    expect(fakeCollections.travel_plans[0].activity).toBe('BEACH_CAMPING'); // Unchanged on dryRun

    const applied = await migrateLegacyBeachCampingData(mockDb, { dryRun: false });
    expect(applied.dryRun).toBe(false);
    expect(fakeCollections.ai_conversations[0].tripState.activity).toBe(ActivityType.CAMPING);
    expect(fakeCollections.ai_conversations[0].tripState.environment).toBe('COASTAL');
    expect(fakeCollections.ai_conversations[0].tripState.ownedGearQuantities).toEqual({ TENT: 1 });
    expect(fakeCollections.travel_plans[0].activity).toBe(ActivityType.CAMPING);
    expect(fakeCollections.travel_plans[0].environment).toBe('COASTAL');
    expect(fakeCollections.gear_rules[0].activity).toBe(ActivityType.CAMPING);
    expect(fakeCollections.communities[0].activityType).toBe(ActivityType.CAMPING);
    expect(fakeCollections.posts[0].activityType).toBe(ActivityType.CAMPING);

    // Second run: simulate empty filter results since already migrated -> 0 updates
    const secondRunDb: any = {
      collection: () => ({
        find: () => ({ toArray: async () => [] }),
        updateOne: async () => ({ modifiedCount: 0 }),
      }),
    };
    const idempotent = await migrateLegacyBeachCampingData(secondRunDb, { dryRun: false });
    expect(idempotent.aiConversationsUpdated).toBe(0);
    expect(idempotent.travelPlansUpdated).toBe(0);
  });

  it('Scenario 3: preserves full destination name "Vườn Quốc gia Cát Bà", suggests unsaved spots, answers savedSpots honestly, and lists missing gear read-only', async () => {
    const conv = await aiService.createConversation(user1Id, {});
    const step1 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn đi biển Cát Bà 2 ngày cho 4 người, tôi đã có 2 túi khô',
      clientMessageId: 'p10-s3-init',
    });
    expect(step1.tripState.destination).toBe('Cát Bà');
    expect(step1.conversation.checklistId).toBeTruthy();
    const versionAfterCreate = checkChecklistVersion(
      checklistsStore,
      step1.conversation.checklistId!,
    );

    // Explicit destination change to longer name containing Cát Bà
    const step2 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Đổi địa điểm thành Vườn Quốc gia Cát Bà đi',
      clientMessageId: 'p10-s3-rename',
    });
    expect(step2.tripState.destination).toBe('Vườn Quốc gia Cát Bà');
    expect(step2.tripState.activity).toBe(ActivityType.BEACH);

    // Spot suggestions must NOT auto-save into tripState
    const step3 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Gợi ý các địa điểm ở Cát Bà',
      clientMessageId: 'p10-s3-suggest',
    });
    expect(step3.reply).toContain('Vịnh Lan Hạ');
    expect(step3.tripState.destination).toBe('Vườn Quốc gia Cát Bà');
    expect(step3.tripState.savedSpots || []).toEqual([]);

    // Saved spots query reports honestly when none saved
    const step4 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Các địa điểm ở Cát Bà mà mình dự định sẽ đi là gì?',
      clientMessageId: 'p10-s3-read-spots',
    });
    expect(step4.reply).toContain('Vườn Quốc gia Cát Bà');
    expect(step4.reply.toLowerCase()).toContain(
      'chưa lưu các điểm dừng chân',
    );

    // Missing items read-only query does NOT bump checklistVersion
    const versionBeforeRead = checkChecklistVersion(
      checklistsStore,
      step1.conversation.checklistId!,
    );
    const step5 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Nhóm còn thiếu những đồ gì?',
      clientMessageId: 'p10-s3-missing-read',
    });
    const versionAfterRead = checkChecklistVersion(
      checklistsStore,
      step1.conversation.checklistId!,
    );
    expect(versionAfterRead).toBe(versionBeforeRead);
    expect(step5.reply).toContain('thiếu');
    expect(step5.reply).toContain('Action Cam / Máy ảnh chống nước');
    expect(step5.reply).toContain('Đồ bơi');
    expect(versionAfterCreate).toBeGreaterThanOrEqual(1);

    // Regression: general/experience question mentioning saved destination ("Kinh nghiệm chọn thuyền kayak đôi chèo qua Hang Sáng Tối ở Cát Bà?")
    // must route to GENERAL_QA (not "Mình vẫn đang lưu thông tin chuyến đi Cát Bà")
    parser.setCustomGeminiGenerator(async () =>
      JSON.stringify({
        turnIntent: 'GENERAL_QA',
        qaAnswer:
          'Khi chọn kayak đôi chèo qua Hang Sáng Tối, bạn nên chọn thuyền sit-on-top ổn định, kiểm tra áo phao vừa vặn và mang túi khô cho điện thoại.',
        destination: null,
        activity: null,
      }),
    );
    const kayakQa = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Kinh nghiệm chọn thuyền kayak đôi chèo qua Hang Sáng Tối ở Cát Bà?',
      clientMessageId: 'p10-s3-kayak-qa',
    });
    parser.setCustomGeminiGenerator(undefined);
    expect(kayakQa.reply).toContain('sit-on-top');
    expect(kayakQa.reply).not.toContain('Mình vẫn đang lưu thông tin chuyến đi');
  });

  it('Scenario 4: switching BEACH -> coastal overnight CAMPING via chat updates checklist rules while preserving compatible owned edits', async () => {
    const conv = await aiService.createConversation(user1Id, {});
    const s1 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn đi biển Cát Bà 2 ngày cho 4 người, tôi đã có 2 ghế cắm trại',
      clientMessageId: 'p10-s4-beach',
    });
    expect(s1.tripState.activity).toBe(ActivityType.BEACH);
    const v1 = checklistsStore.get(String(s1.conversation.checklistId));
    expect(v1.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR')?.quantityOwned).toBe(2);
    expect(v1.items.some((i: any) => i.categoryCode === 'TENT')).toBe(false);

    // Switch via chat to coastal overnight camping
    const s2 = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Đổi sang cắm trại qua đêm ở bãi biển Cát Bà đi',
      clientMessageId: 'p10-s4-camp',
    });
    expect(s2.tripState.activity).toBe(ActivityType.CAMPING);
    expect(s2.tripState.environment).toBe('COASTAL');
    expect(s2.tripState.isOvernight).toBe(true);

    const v2 = checklistsStore.get(String(s2.conversation.checklistId));
    expect(v2.items.some((i: any) => i.categoryCode === 'TENT')).toBe(true);
    expect(v2.items.some((i: any) => i.categoryCode === 'TARP')).toBe(true);
    expect(v2.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR')?.quantityOwned).toBe(2);
  });

  it('Scenario 5: handles in-chat rental matching ("Tìm thuê đồ đi biển còn thiếu"), asks missing dates/pickupArea first, then calls ChecklistsService.matchMissingGear', async () => {
    // Wire a real ChecklistsService alongside AiService using shared in-memory stores
    const ownerId = new Types.ObjectId();
    const gearItemsStore = new Map<string, any>();
    const camId = new Types.ObjectId();
    gearItemsStore.set(String(camId), {
      _id: camId,
      ownerId,
      categoryCode: 'CAMERA',
      title: '[DEMO] GoPro Hero 12 Chống Nước',
      condition: GearCondition.LIKE_NEW,
      attributes: {},
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 180000,
      depositAmount: 2000000,
      city: 'Hải Phòng',
      district: 'Cát Hải',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.9,
    });

    const chain = (res: any) => makeChainable(res);
    const withToObject = (doc: any) => ({
      ...doc,
      toObject() {
        return { ...this };
      },
    });
    const fakeConvModel: any = {
      create: jest.fn((p: any) => {
        const id = new Types.ObjectId();
        const doc = withToObject({ _id: id, ...p, createdAt: new Date(), updatedAt: new Date() });
        aiConversationsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findById: jest.fn((id: any) => chain(aiConversationsStore.get(String(id)) || null)),
      findOneAndUpdate: jest.fn((f: any, u: any) => {
        const cur = aiConversationsStore.get(String(f._id));
        if (!cur) return chain(null);
        Object.assign(cur, u.$set);
        return chain(cur);
      }),
      findByIdAndUpdate: jest.fn((id: any, u: any) => {
        const cur = aiConversationsStore.get(String(id));
        if (cur && u.$set) Object.assign(cur, u.$set);
        return chain(cur || null);
      }),
    };
    const fakeMsgModel: any = {
      findOne: jest.fn((f: any) =>
        chain(Array.from(aiMessagesStore.values()).find((m) => m.clientMessageId === f.clientMessageId) || null),
      ),
      find: jest.fn((f: any) =>
        chain(
          Array.from(aiMessagesStore.values()).filter(
            (m) => String(m.aiConversationId) === String(f.aiConversationId),
          ),
        ),
      ),
      create: jest.fn((p: any) => {
        const id = new Types.ObjectId();
        const doc = withToObject({ _id: id, ...p, createdAt: new Date() });
        aiMessagesStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
    };
    const fakePlanModel: any = {
      findById: jest.fn((id: any) => chain(travelPlansStore.get(String(id)) || null)),
      create: jest.fn((p: any) => {
        const id = new Types.ObjectId();
        const doc = withToObject({ _id: id, ...p });
        travelPlansStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findByIdAndUpdate: jest.fn((id: any, u: any) => {
        const cur = travelPlansStore.get(String(id));
        if (cur && u.$set) Object.assign(cur, u.$set);
        return chain(cur || null);
      }),
    };
    const fakeClModel: any = {
      findOne: jest.fn((f: any) =>
        chain(Array.from(checklistsStore.values()).find((c) => String(c.travelPlanId) === String(f.travelPlanId)) || null),
      ),
      findById: jest.fn((id: any) => chain(checklistsStore.get(String(id)) || null)),
      create: jest.fn((p: any) => {
        const id = new Types.ObjectId();
        const doc = withToObject({ _id: id, ...p });
        checklistsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findByIdAndUpdate: jest.fn((id: any, u: any) => {
        const cur = checklistsStore.get(String(id));
        if (cur && u.$set) Object.assign(cur, u.$set);
        return chain(cur || null);
      }),
    };
    const fakeGearModel: any = {
      find: jest.fn((f: any) =>
        chain(
          Array.from(gearItemsStore.values()).filter((g) => {
            if (f.categoryCode) {
              if (f.categoryCode.$in) {
                if (!f.categoryCode.$in.includes(g.categoryCode)) return false;
              } else if (g.categoryCode !== f.categoryCode) {
                return false;
              }
            }
            if (f.ownerId?.$ne && String(g.ownerId) === String(f.ownerId.$ne)) {
              return false;
            }
            return g.status === GearStatus.ACTIVE && g.isActive;
          }),
        ),
      ),
      findById: jest.fn((id: any) => chain(gearItemsStore.get(String(id)) || null)),
    };
    const fakeAvailModel: any = { find: jest.fn(() => chain([])) };
    const fakeBookingModel: any = { find: jest.fn(() => chain([])) };
    const fakeProfileModel: any = {
      find: jest.fn(() =>
        chain([{ userId: ownerId, fullName: 'Hải Phòng Gear', username: 'hp_gear', trustScore: 4.8 }]),
      ),
    };
    const realChecklistSvc = new ChecklistsService(
      fakePlanModel,
      fakeClModel,
      fakeConvModel,
      { find: jest.fn(() => chain(gearRulesStore)) } as any,
      fakeGearModel,
      fakeAvailModel,
      fakeBookingModel,
      fakeProfileModel,
      new AvailabilityService(fakeAvailModel, fakeGearModel, fakeBookingModel),
    );
    const aiWithMatch = new AiService(
      fakeConvModel,
      fakeMsgModel,
      fakePlanModel,
      fakeClModel,
      { find: jest.fn(() => chain(gearRulesStore)) } as any,
      parser,
      validator,
      realChecklistSvc,
    );

    const conv = await aiWithMatch.createConversation(user1Id, {});
    await aiWithMatch.sendMessage(conv.id, user1Id, {
      content: 'Tôi muốn đi biển Cát Bà 2 ngày cho 2 người',
      clientMessageId: 'p10-s5-1',
    });

    // Missing dates & pickupArea -> asks clearly without throwing
    const askRentNoDates = await aiWithMatch.sendMessage(conv.id, user1Id, {
      content: 'Tìm thuê đồ đi biển còn thiếu',
      clientMessageId: 'p10-s5-2',
    });
    expect(askRentNoDates.reply).toContain(
      'ngày đi / ngày nhận đồ và khu vực nhận đồ',
    );

    // Provide dates & Hải Phòng -> calls real ChecklistsService.matchMissingGear and returns GoPro Hero 12 + self-prepare separation
    const matchedReply = await aiWithMatch.sendMessage(conv.id, user1Id, {
      content: 'Tìm thuê đồ đi biển còn thiếu từ 2026-12-10 đến 2026-12-12 nhận đồ tại Hải Phòng',
      clientMessageId: 'p10-s5-3',
    });
    expect(matchedReply.reply).toContain('GoPro Hero 12 Chống Nước');
    expect(matchedReply.reply).toContain('Đồ bơi');
  });

  it('Resilience: handles Gemini INVALID_SCHEMA and TIMEOUT gracefully without crashing or inventing state', async () => {
    const conv = await aiService.createConversation(user1Id, {});

    // Gemini returns non-conforming schema -> safe error boundary on SMALL_TALK / OPEN_QA or fallback on structured
    parser.setCustomGeminiGenerator(async () => {
      throw new HttpException('Gemini API không phản hồi sau 60000ms', 504);
    });

    const localFallbackQaRes = await aiService.sendMessage(conv.id, user1Id, {
      content: 'Ở Cát Bà có gì nổi bật?',
      clientMessageId: 'p10-res-timeout-local',
    });
    expect(localFallbackQaRes.reply).toContain('Cát Bà');
    expect(localFallbackQaRes.tripState.destination).toBeNull();

    // Open-ended question outside local knowledge under timeout -> rejects cleanly with HttpException and preserves empty tripState
    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Kinh nghiệm chọn thuyền kayak đôi chèo qua Hang Sáng Tối?',
        clientMessageId: 'p10-res-timeout',
      }),
    ).rejects.toThrow(HttpException);
    const afterTimeoutConv = await aiService.getConversationById(conv.id, user1Id);
    expect(afterTimeoutConv.tripState.destination).toBeNull();

    // Structured schema invalid response check -> clean HttpException without mutating tripState
    parser.setCustomGeminiGenerator(async () => '{invalid-json');
    await expect(
      aiService.sendMessage(conv.id, user1Id, {
        content: 'Kinh nghiệm chọn túi khô đi biển?',
        clientMessageId: 'p10-res-invalid',
      }),
    ).rejects.toThrow(HttpException);
    const afterInvalidConv = await aiService.getConversationById(conv.id, user1Id);
    expect(afterInvalidConv.tripState.destination).toBeNull();

    parser.setCustomGeminiGenerator(undefined);
  });
});

function checkChecklistVersion(store: Map<string, any>, id: string): number {
  return Number(store.get(String(id))?.checklistVersion || 1);
}
