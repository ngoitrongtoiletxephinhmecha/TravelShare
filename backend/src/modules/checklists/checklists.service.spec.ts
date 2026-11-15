import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChecklistsService } from './checklists.service';
import { AvailabilityService } from '../gear/availability.service';
import {
  ActivityType,
  BookingStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
} from '../../common/enums/system.enums';

describe('ChecklistsService & Gear Matching Suite (Phase 7)', () => {
  const user1Id = new Types.ObjectId().toString();
  const user2Id = new Types.ObjectId().toString();
  const ownerId = new Types.ObjectId().toString();

  let travelPlansStore: Map<string, any>;
  let checklistsStore: Map<string, any>;
  let aiConversationsStore: Map<string, any>;
  let gearRulesStore: any[];
  let gearItemsStore: Map<string, any>;
  let availabilityStore: any[];
  let bookingsStore: any[];
  let profilesStore: Map<string, any>;

  let availabilityService: AvailabilityService;
  let checklistsService: ChecklistsService;

  const makeChainable = (result: any) => ({
    lean: jest.fn().mockResolvedValue(result),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    travelPlansStore = new Map();
    checklistsStore = new Map();
    aiConversationsStore = new Map();
    gearRulesStore = [];
    gearItemsStore = new Map();
    availabilityStore = [];
    bookingsStore = [];
    profilesStore = new Map();

    profilesStore.set(ownerId, {
      userId: new Types.ObjectId(ownerId),
      username: 'quan_trekking',
      fullName: 'Trần Minh Quân',
      avatarUrl: '',
      trustScore: 4.9,
    });

    const mockTravelPlanModel: any = {
      findById: jest.fn().mockImplementation((id: any) =>
        makeChainable(travelPlansStore.get(String(id)) || null),
      ),
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
      findOne: jest.fn().mockImplementation((filter: any) => {
        const found =
          Array.from(checklistsStore.values()).find(
            (c) => String(c.travelPlanId) === String(filter.travelPlanId),
          ) || null;
        return makeChainable(found);
      }),
      findById: jest.fn().mockImplementation((id: any) =>
        makeChainable(checklistsStore.get(String(id)) || null),
      ),
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
        checklistsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = checklistsStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
          checklistsStore.set(String(id), existing);
        }
        return makeChainable(existing || null);
      }),
    };

    const mockAiConversationModel: any = {
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = aiConversationsStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set);
        }
        return makeChainable(existing || null);
      }),
    };

    const mockGearRuleModel: any = {
      find: jest.fn().mockImplementation(() => makeChainable(gearRulesStore)),
    };

    const mockGearItemModel: any = {
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(gearItemsStore.values()).filter((g) => {
          if (filter.categoryCode && g.categoryCode !== filter.categoryCode) {
            return false;
          }
          if (filter.status && g.status !== filter.status) return false;
          if (
            filter.moderationStatus &&
            g.moderationStatus !== filter.moderationStatus
          ) {
            return false;
          }
          if (filter.isActive !== undefined && g.isActive !== filter.isActive) {
            return false;
          }
          return true;
        });
        return makeChainable(list);
      }),
      findById: jest.fn().mockImplementation((id: any) =>
        makeChainable(gearItemsStore.get(String(id)) || null),
      ),
    };

    const mockAvailabilityModel: any = {
      find: jest.fn().mockImplementation((filter: any) => {
        const startLt = filter.startAt?.$lt;
        const endGt = filter.endAt?.$gt;
        const list = availabilityStore.filter((a) => {
          if (String(a.gearId) !== String(filter.gearId)) return false;
          if (startLt && !(new Date(a.startAt) < new Date(startLt))) {
            return false;
          }
          if (endGt && !(new Date(a.endAt) > new Date(endGt))) {
            return false;
          }
          return true;
        });
        return makeChainable(list);
      }),
    };

    const mockBookingModel: any = {
      find: jest.fn().mockImplementation((filter: any) => {
        const startLt = filter.startAt?.$lt;
        const endGt = filter.endAt?.$gt;
        const allowedStatuses: string[] = filter.status?.$in || [];
        const list = bookingsStore.filter((b) => {
          if (String(b.gearId) !== String(filter.gearId)) return false;
          if (
            allowedStatuses.length > 0 &&
            !allowedStatuses.includes(b.status)
          ) {
            return false;
          }
          if (startLt && !(new Date(b.startAt) < new Date(startLt))) {
            return false;
          }
          if (endGt && !(new Date(b.endAt) > new Date(endGt))) {
            return false;
          }
          return true;
        });
        return makeChainable(list);
      }),
    };

    const mockProfileModel: any = {
      find: jest.fn().mockImplementation(() =>
        makeChainable(Array.from(profilesStore.values())),
      ),
    };

    availabilityService = new AvailabilityService(
      mockGearItemModel,
      mockAvailabilityModel,
    );

    checklistsService = new ChecklistsService(
      mockTravelPlanModel,
      mockChecklistModel,
      mockAiConversationModel,
      mockGearRuleModel,
      mockGearItemModel,
      mockAvailabilityModel,
      mockBookingModel,
      mockProfileModel,
      availabilityService,
    );
  });

  // =========================================================================
  // 1. CREATE CHECKLIST, UPDATE OWNED QUANTITY & PRESERVE WHEN TRAVELERS 3 -> 4
  // =========================================================================
  it('creates checklist for 1-day 3-person trekking, updates owned backpack to 2 (missing 1), and preserves owned=2 when travelers changes to 4 (missing 2)', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Yên Tử',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 3,
      ownedGearCodes: [],
      planVersion: 1,
    });

    // Step 1: Create checklist (and verify idempotency on repeated call)
    const cl1 = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );
    const cl1Repeat = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );
    expect(cl1Repeat.id).toBe(cl1.id);
    expect(checklistsStore.size).toBe(1);

    const backpack1 = cl1.items.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(backpack1).toBeDefined();
    expect(backpack1.quantityRequired).toBe(3);
    expect(backpack1.quantityOwned).toBe(0);
    expect(backpack1.quantityMissing).toBe(3);
    expect(backpack1.canRent).toBe(true);

    // Non-rentable consumables (Water & Food) are kept in checklist with canRent = false
    const waterItem = cl1.items.find(
      (i: any) => i.categoryCode === 'WATER_ELECTROLYTE',
    );
    expect(waterItem).toBeDefined();
    expect(waterItem.canRent).toBe(false);
    expect(waterItem.isRentable).toBe(false);

    // Step 2: User enters quantityOwned = 2 for BACKPACK -> missing becomes 1
    const afterUpdateOwned = await checklistsService.updateChecklistItem(
      user1Id,
      cl1.id,
      backpack1.itemId,
      { quantityOwned: 2 },
    );
    const backpack2 = afterUpdateOwned.items.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(backpack2.quantityRequired).toBe(3);
    expect(backpack2.quantityOwned).toBe(2);
    expect(backpack2.quantityMissing).toBe(1);
    expect(afterUpdateOwned.checklistVersion).toBe(2);

    // Step 3: Change travelers from 3 -> 4 in TravelPlan (planVersion = 2)
    travelPlansStore.set(String(planId), {
      ...travelPlansStore.get(String(planId)),
      travelers: 4,
      planVersion: 2,
    });

    const clAfterScale = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );
    const backpack3 = clAfterScale.items.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(backpack3.quantityRequired).toBe(4);
    expect(backpack3.quantityOwned).toBe(2); // Preserved!
    expect(backpack3.quantityMissing).toBe(2); // 4 - 2 = 2!

    // Step 4: Reloading checklist by ID returns the persisted state
    const reloaded = await checklistsService.getChecklistById(user1Id, cl1.id);
    const reloadedBp = reloaded.items.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(reloadedBp.quantityRequired).toBe(4);
    expect(reloadedBp.quantityOwned).toBe(2);
    expect(reloadedBp.quantityMissing).toBe(2);
  });

  // =========================================================================
  // 2. MATCH MISSING GEAR BY SCHEDULE [startAt, endAt) & AREA (ĐỐNG ĐA, HÀ NỘI)
  // =========================================================================
  it('filters out booked/blocked gear and other areas, returning only the available backpack in Đống Đa with coverage "Đáp ứng 1/2"', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Yên Tử',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 4,
      ownedGearCodes: [],
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );
    // Set BACKPACK owned = 2 (so missing = 2), and mark other rentable items as owned so we focus on BACKPACK
    for (const item of cl.items) {
      if (item.categoryCode === 'BACKPACK') {
        await checklistsService.updateChecklistItem(user1Id, cl.id, item.itemId, {
          quantityOwned: 2,
        });
      } else if (item.canRent) {
        await checklistsService.updateChecklistItem(user1Id, cl.id, item.itemId, {
          quantityOwned: item.quantityRequired,
        });
      }
    }

    // Seed 3 backpacks:
    // (1) Available backpack in Đống Đa, Hà Nội with totalQuantity = 1
    const bp1Id = new Types.ObjectId();
    gearItemsStore.set(String(bp1Id), {
      _id: bp1Id,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Deuter 36L (Đống Đa - Còn trống)',
      condition: GearCondition.LIKE_NEW,
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 70000,
      depositAmount: 500000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.9,
    });

    // (2) Backpack in Đống Đa, Hà Nội that is already blocked/booked in [2026-12-10, 2026-12-12)
    const bp2Id = new Types.ObjectId();
    gearItemsStore.set(String(bp2Id), {
      _id: bp2Id,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Naturehike 45L (Đống Đa - Đã kín lịch)',
      condition: GearCondition.GOOD,
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 60000,
      depositAmount: 400000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.8,
    });
    availabilityStore.push({
      gearId: bp2Id,
      startAt: new Date('2026-12-09T00:00:00.000Z'),
      endAt: new Date('2026-12-15T00:00:00.000Z'),
      reservedQuantity: 1,
      reason: 'BOOKED',
    });

    // (3) Backpack in another area (Hải Châu, Đà Nẵng)
    const bp3Id = new Types.ObjectId();
    gearItemsStore.set(String(bp3Id), {
      _id: bp3Id,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Osprey 50L (Đà Nẵng)',
      condition: GearCondition.NEW,
      totalQuantity: 2,
      sharingType: GearListingType.RENT,
      pricePerDay: 80000,
      depositAmount: 600000,
      city: 'Đà Nẵng',
      district: 'Hải Châu',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 5.0,
    });

    const matchRes = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-10',
      endAt: '2026-12-12',
      pickupArea: 'Đống Đa, Hà Nội',
    });

    expect(matchRes.interval.rentalDays).toBe(2);
    expect(matchRes.itemMatches.length).toBe(1);

    const bpGroup = matchRes.itemMatches[0];
    expect(bpGroup.categoryCode).toBe('BACKPACK');
    expect(bpGroup.quantityMissing).toBe(2);
    expect(bpGroup.candidates.length).toBe(1);

    const matchedCandidate = bpGroup.candidates[0];
    expect(matchedCandidate.gearId).toBe(String(bp1Id));
    expect(matchedCandidate.availableQuantity).toBe(1);
    expect(matchedCandidate.fulfillableQuantity).toBe(1);
    expect(matchedCandidate.coverageLabel).toBe('Đáp ứng 1/2');
    // Rental fee for 2 days * 70,000 * 1 = 140,000 VND (deposit 500,000 VND kept separate)
    expect(matchedCandidate.estimatedRentalTotal).toBe(140000);
    expect(matchedCandidate.depositAmount).toBe(500000);
    expect(matchedCandidate.bookingUrl).toContain(
      `/gear/${String(bp1Id)}?startAt=2026-12-10&endAt=2026-12-12&quantity=1`,
    );
  });

  // =========================================================================
  // 3. BUDGET 0đ, OVER-BUDGET, SHOE SIZE FILTER & TOTAL BUDGET EVALUATION
  // =========================================================================
  it('returns diagnostic reasons for 0đ budget and unavailable shoe size, and only marks "Đủ đồ trong ngân sách" when all missing items are fulfilled within budget', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Yên Tử',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 1,
      ownedGearCodes: ['BACKPACK', 'TREKKING_POLES', 'HEADLAMP'],
      ownedGearQuantities: { BACKPACK: 1, TREKKING_POLES: 1, HEADLAMP: 1 },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );

    // Only TREKKING_SHOES is missing (quantityMissing = 1)
    const shoeItem = cl.items.find(
      (i: any) => i.categoryCode === 'TREKKING_SHOES',
    );
    expect(shoeItem.quantityMissing).toBe(1);

    // Seed a pair of Trekking Shoes Size 41 in Đống Đa, Hà Nội (pricePerDay: 85,000 VND)
    const shoe41Id = new Types.ObjectId();
    gearItemsStore.set(String(shoe41Id), {
      _id: shoe41Id,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TREKKING_SHOES',
      title: '[DEMO] Giày Trekking Salomon Size 41',
      condition: GearCondition.LIKE_NEW,
      attributes: { sizeEu: 41, size: '41' },
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 85000,
      depositAmount: 600000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 5.0,
    });

    // Case A: User requires Size 44 (not available)
    await checklistsService.updateChecklistItem(user1Id, cl.id, shoeItem.itemId, {
      requiredAttributes: { size: '44' },
    });

    const resWrongSize = await checklistsService.matchMissingGear(
      user1Id,
      cl.id,
      {
        startAt: '2026-12-10',
        endAt: '2026-12-12',
        pickupArea: 'Đống Đa, Hà Nội',
      },
    );
    expect(resWrongSize.itemMatches[0].candidates.length).toBe(0);
    expect(resWrongSize.itemMatches[0].unmatchedReason).toContain('Size 44');
    expect(resWrongSize.budgetSummary.isWithinTotalBudget).toBe(false);

    // Case B: User updates required size to 41, but sets budgetVnd = 0 (free loan only)
    await checklistsService.updateChecklistItem(user1Id, cl.id, shoeItem.itemId, {
      requiredAttributes: { size: '41' },
    });

    const resZeroBudget = await checklistsService.matchMissingGear(
      user1Id,
      cl.id,
      {
        startAt: '2026-12-10',
        endAt: '2026-12-12',
        pickupArea: 'Đống Đa, Hà Nội',
        budgetVnd: 0,
      },
    );
    expect(resZeroBudget.itemMatches[0].candidates.length).toBe(0);
    expect(resZeroBudget.itemMatches[0].unmatchedReason).toContain('0đ');
    expect(resZeroBudget.budgetSummary.isWithinTotalBudget).toBe(false);

    // Case C: User sets budgetVnd = 300,000 VND (2 days * 85,000 = 170,000 VND <= 300,000 VND)
    const resWithinBudget = await checklistsService.matchMissingGear(
      user1Id,
      cl.id,
      {
        startAt: '2026-12-10',
        endAt: '2026-12-12',
        pickupArea: 'Đống Đa, Hà Nội',
        budgetVnd: 300000,
      },
    );
    expect(resWithinBudget.itemMatches[0].candidates.length).toBe(1);
    expect(resWithinBudget.budgetSummary.isWithinTotalBudget).toBe(true);
    expect(resWithinBudget.budgetSummary.statusLabel).toBe(
      'Đủ đồ trong ngân sách',
    );
  });

  // =========================================================================
  // 4. VALIDATION EDGE CASES & OWNERSHIP AUTHORIZATION (403 FORBIDDEN)
  // =========================================================================
  it('validates quantityOwned & date intervals and blocks unauthorized access from a second account', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Yên Tử',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 3,
      ownedGearCodes: [],
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );

    // Negative or non-integer quantityOwned -> 400 BadRequestException
    await expect(
      checklistsService.updateChecklistItem(user1Id, cl.id, 'item_BACKPACK', {
        quantityOwned: -1,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      checklistsService.updateChecklistItem(user1Id, cl.id, 'item_BACKPACK', {
        quantityOwned: 1.5,
      }),
    ).rejects.toThrow(BadRequestException);

    // quantityOwned > quantityRequired -> clamps quantityMissing to 0
    const overOwned = await checklistsService.updateChecklistItem(
      user1Id,
      cl.id,
      'item_BACKPACK',
      { quantityOwned: 5 },
    );
    const bpItem = overOwned.items.find(
      (i: any) => i.categoryCode === 'BACKPACK',
    );
    expect(bpItem.quantityOwned).toBe(5);
    expect(bpItem.quantityMissing).toBe(0);

    // Invalid date interval (startAt >= endAt) -> 400 BadRequestException
    await expect(
      checklistsService.matchMissingGear(user1Id, cl.id, {
        startAt: '2026-12-15',
        endAt: '2026-12-10',
      }),
    ).rejects.toThrow(BadRequestException);

    // User 2 cannot access or modify User 1's plan or checklist -> 403 ForbiddenException
    await expect(
      checklistsService.generateOrGetChecklistForPlan(user2Id, String(planId)),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      checklistsService.getChecklistById(user2Id, cl.id),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      checklistsService.updateChecklistItem(user2Id, cl.id, 'item_BACKPACK', {
        quantityOwned: 1,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      checklistsService.matchMissingGear(user2Id, cl.id, {
        startAt: '2026-12-10',
        endAt: '2026-12-12',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // =========================================================================
  // 5. SHARED CHECKLIST MUTATIONS (SET_REQUIRED, ADD_ITEM, REMOVE_ITEM) & REGENERATION PRESERVATION
  // =========================================================================
  it('supports adding custom items, updating quantityRequired, removing items from checklist & gear matching, and preserves manual edits on regenerate', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Hồ Trị An',
      activity: ActivityType.CAMPING,
      durationDays: 2,
      travelers: 4,
      ownedGearCodes: ['BACKPACK'], // mentioned without quantity -> must NOT auto-set quantityOwned = quantityRequired!
      ownedGearQuantities: { TENT: 1 },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );

    const tent1 = cl.items.find((i: any) => i.categoryCode === 'TENT');
    expect(tent1).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
      userEditedOwned: true,
    });

    // Update required tents to 3 via UI endpoint -> preserves owned = 1, missing = 2
    const afterSetReq = await checklistsService.updateChecklistItem(
      user1Id,
      cl.id,
      'item_TENT',
      { quantityRequired: 3 },
    );
    expect(
      afterSetReq.items.find((i: any) => i.categoryCode === 'TENT'),
    ).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
      userEditedRequired: true,
    });

    // Add 1 tarp ("Tấm bạt") via UI endpoint
    const afterAddTarp = await checklistsService.addChecklistItem(
      user1Id,
      cl.id,
      {
        name: 'Tấm bạt',
        categoryCode: 'TARP',
        quantityRequired: 1,
      },
    );
    expect(
      afterAddTarp.items.find((i: any) => i.categoryCode === 'TARP'),
    ).toMatchObject({
      categoryCode: 'TARP',
      quantityRequired: 1,
      quantityOwned: 0,
      quantityMissing: 1,
      isCustomItem: true,
    });

    // Remove camping chair ("CAMPING_CHAIR") from checklist
    const afterRemoveChair = await checklistsService.removeChecklistItem(
      user1Id,
      cl.id,
      'item_CAMPING_CHAIR',
    );
    expect(
      afterRemoveChair.items.find(
        (i: any) => i.categoryCode === 'CAMPING_CHAIR',
      ),
    ).toBeUndefined();
    expect(afterRemoveChair.removedItemCodes).toContain('CAMPING_CHAIR');

    // Regenerate checklist from rules -> preserves tent (3/1/2), custom tarp (1/0/1), and keeps chair removed!
    const afterRegen = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
      { forceRegenerate: true },
    );
    expect(
      afterRegen.items.find((i: any) => i.categoryCode === 'TENT'),
    ).toMatchObject({
      quantityRequired: 3,
      quantityOwned: 1,
      quantityMissing: 2,
      userEditedOwned: true,
      userEditedRequired: true,
    });
    expect(
      afterRegen.items.find((i: any) => i.categoryCode === 'TARP'),
    ).toMatchObject({
      quantityRequired: 1,
      quantityOwned: 0,
      quantityMissing: 1,
      isCustomItem: true,
    });
    expect(
      afterRegen.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR'),
    ).toBeUndefined();
  });
});
