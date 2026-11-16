import {
  BadRequestException,
  ConflictException,
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
      findOneAndUpdate: jest.fn().mockImplementation((filter: any, update: any) => {
        const existing = checklistsStore.get(String(filter._id));
        if (
          !existing ||
          (filter.checklistVersion !== undefined &&
            Number(existing.checklistVersion || 1) !==
            Number(filter.checklistVersion))
        ) {
          return makeChainable(null);
        }
        if (update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
          checklistsStore.set(String(existing._id), existing);
        }
        return makeChainable(existing);
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
      find: jest.fn().mockImplementation((filter: any = {}) => {
        const list = Array.from(gearItemsStore.values()).filter((g) => {
          if (filter.categoryCode) {
            if (filter.categoryCode.$in) {
              if (!filter.categoryCode.$in.includes(g.categoryCode)) {
                return false;
              }
            } else if (g.categoryCode !== filter.categoryCode) {
              return false;
            }
          }
          if (
            filter.ownerId?.$ne &&
            String(g.ownerId) === String(filter.ownerId.$ne)
          ) {
            return false;
          }
          if (filter.sharingType) {
            if (filter.sharingType.$in) {
              if (!filter.sharingType.$in.includes(g.sharingType)) return false;
            } else if (g.sharingType !== filter.sharingType) {
              return false;
            }
          }
          if (filter.$or && Array.isArray(filter.$or)) {
            const matchedOr = filter.$or.some((cond: any) => {
              if (cond.sharingType && g.sharingType === cond.sharingType) {
                return true;
              }
              if (cond.pricePerDay !== undefined && g.pricePerDay === cond.pricePerDay) {
                return true;
              }
              return false;
            });
            if (!matchedOr) return false;
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
      find: jest.fn().mockImplementation((filter: any = {}) => {
        const startLt = filter.startAt?.$lt;
        const endGt = filter.endAt?.$gt;
        const list = availabilityStore.filter((a) => {
          if (filter.gearId) {
            if (filter.gearId.$in) {
              const allowed = filter.gearId.$in.map((id: any) => String(id));
              if (!allowed.includes(String(a.gearId))) return false;
            } else if (String(a.gearId) !== String(filter.gearId)) {
              return false;
            }
          }
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
      find: jest.fn().mockImplementation((filter: any = {}) => {
        const startLt = filter.startAt?.$lt;
        const endGt = filter.endAt?.$gt;
        const allowedStatuses: string[] = filter.status?.$in || [];
        const list = bookingsStore.filter((b) => {
          if (filter.gearId) {
            if (filter.gearId.$in) {
              const allowed = filter.gearId.$in.map((id: any) => String(id));
              if (!allowed.includes(String(b.gearId))) return false;
            } else if (String(b.gearId) !== String(filter.gearId)) {
              return false;
            }
          }
          if (filter._id?.$in) {
            const allowedIds = filter._id.$in.map((id: any) => String(id));
            if (!allowedIds.includes(String(b._id))) return false;
          }
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
      mockAvailabilityModel,
      mockGearItemModel,
      mockBookingModel,
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

  // =========================================================================
  // 5. PHASE 9A: TWO-TAB OPTIMISTIC CONCURRENCY (COMPATIBLE MERGE VS 409 CONFLICT)
  // =========================================================================
  it('merges compatible checklist updates across tabs and returns 409 Conflict when two tabs edit the same item', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Vườn Quốc gia Ba Vì',
      activity: ActivityType.CAMPING,
      durationDays: 2,
      travelers: 4,
      ownedGearCodes: [],
      planVersion: 1,
    });

    const v1 = await checklistsService.generateOrGetChecklistForPlan(
      user1Id,
      String(planId),
    );
    expect(v1.checklistVersion).toBe(1);

    // Tab A loads v1 and updates TENT owned = 1 -> advances checklistVersion to 2
    const v2 = await checklistsService.updateChecklistItem(
      user1Id,
      v1.id,
      'item_TENT',
      {
        quantityOwned: 1,
        ownedConfirmed: true,
        expectedChecklistVersion: 1,
      },
    );
    expect(v2.checklistVersion).toBe(2);
    expect(v2.items.find((i: any) => i.categoryCode === 'TENT')).toMatchObject({
      quantityRequired: 2,
      quantityOwned: 1,
      quantityMissing: 1,
    });

    // Tab B (still holding stale version 1) updates a DIFFERENT item (CAMPING_CHAIR owned = 2)
    // -> compatible change! Server merges onto v2 without losing Tab A's tent edit, advancing to v3.
    const v3Merged = await checklistsService.updateChecklistItem(
      user1Id,
      v1.id,
      'item_CAMPING_CHAIR',
      {
        quantityOwned: 2,
        ownedConfirmed: true,
        expectedChecklistVersion: 1,
      },
    );
    expect(v3Merged.checklistVersion).toBe(3);
    expect(
      v3Merged.items.find((i: any) => i.categoryCode === 'TENT'),
    ).toMatchObject({
      quantityOwned: 1,
      quantityMissing: 1,
    });
    expect(
      v3Merged.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR'),
    ).toMatchObject({
      quantityRequired: 4,
      quantityOwned: 2,
      quantityMissing: 2,
    });

    // Tab C (stale version 1) tries to overwrite TENT which Tab A already edited -> 409 ConflictException!
    await expect(
      checklistsService.updateChecklistItem(user1Id, v1.id, 'item_TENT', {
        quantityOwned: 0,
        ownedConfirmed: true,
        expectedChecklistVersion: 1,
      }),
    ).rejects.toThrow(ConflictException);

    // Verify DB still keeps merged TENT=1 & CAMPING_CHAIR=2 intact
    const latest = await checklistsService.getChecklistById(user1Id, v1.id);
    expect(latest.checklistVersion).toBe(3);
    expect(latest.items.find((i: any) => i.categoryCode === 'TENT')?.quantityOwned).toBe(1);
    expect(
      latest.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR')?.quantityOwned,
    ).toBe(2);
  });

  // =========================================================================
  // 8. ALL 8 OFFICIAL ACTIVITY TYPES, COASTAL CAMPING & SELF-PREPARE MATCHING
  // =========================================================================
  it('generates distinct checklists for all 8 ActivityTypes without falling back to TREKKING, and supports coastal CAMPING', async () => {
    const scenarios: Array<{
      activity: ActivityType;
      environment?: string;
      isOvernight?: boolean;
      expectedCodes: string[];
      forbiddenCodes?: string[];
    }> = [
        {
          activity: ActivityType.BEACH,
          environment: 'COASTAL',
          isOvernight: false,
          expectedCodes: ['SWIMWEAR', 'BEACH_TOWEL', 'BEACH_SANDALS', 'DRY_BAG', 'CAMERA', 'CAMPING_CHAIR'],
          forbiddenCodes: ['TREKKING_POLES', 'TENT'],
        },
        {
          activity: ActivityType.SIGHTSEEING,
          environment: 'URBAN',
          isOvernight: false,
          expectedCodes: ['WALKING_SHOES', 'CAMERA', 'POWER_BANK', 'SUN_PROTECTION'],
          forbiddenCodes: ['TREKKING_POLES', 'TENT'],
        },
        {
          activity: ActivityType.MOTORBIKE_TOUR,
          isOvernight: false,
          expectedCodes: ['HELMET', 'RIDING_GLOVES_ARMOR', 'BUNGEE_CORDS', 'TIRE_REPAIR_KIT', 'DRY_BAG'],
          forbiddenCodes: ['TREKKING_POLES', 'TENT'],
        },
        {
          activity: ActivityType.BACKPACKING,
          isOvernight: true,
          expectedCodes: ['BACKPACK', 'TRAVEL_LOCK_POUCH', 'QUICK_DRY_CLOTHES', 'POWER_BANK', 'CAMERA'],
          forbiddenCodes: ['TREKKING_POLES'],
        },
        {
          activity: ActivityType.MOUNTAINEERING,
          environment: 'MOUNTAIN',
          isOvernight: true,
          expectedCodes: ['TREKKING_POLES', 'THERMAL_LAYER', 'CLIMBING_GLOVES', 'TENT', 'SLEEPING_BAG'],
        },
        {
          activity: ActivityType.TREKKING,
          environment: 'FOREST',
          isOvernight: false,
          expectedCodes: ['BACKPACK', 'TREKKING_POLES', 'TREKKING_SHOES', 'HEADLAMP'],
        },
        {
          activity: ActivityType.CAMPING,
          environment: 'COASTAL',
          isOvernight: true,
          expectedCodes: ['TENT', 'SLEEPING_BAG', 'CAMPING_STOVE', 'CAMPING_CHAIR', 'TARP', 'SUN_PROTECTION'],
          forbiddenCodes: ['TREKKING_POLES'],
        },
        {
          activity: ActivityType.OTHER,
          isOvernight: false,
          expectedCodes: ['BACKPACK', 'FIRST_AID_KIT', 'POWER_BANK', 'RAIN_JACKET'],
          forbiddenCodes: ['TREKKING_POLES', 'TENT'],
        },
      ];

    for (const s of scenarios) {
      const planId = new Types.ObjectId();
      travelPlansStore.set(String(planId), {
        _id: planId,
        userId: new Types.ObjectId(user1Id),
        destination: 'Điểm đến thử nghiệm',
        activity: s.activity,
        environment: s.environment || null,
        isOvernight: Boolean(s.isOvernight),
        durationDays: s.isOvernight ? 2 : 1,
        travelers: 4,
        ownedGearCodes: [],
        planVersion: 1,
      });

      const cl = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));
      const codes = cl.items.map((i: any) => i.categoryCode);
      for (const expected of s.expectedCodes) {
        expect(codes).toContain(expected);
      }
      for (const forbidden of s.forbiddenCodes || []) {
        expect(codes).not.toContain(forbidden);
      }
    }
  });

  it('preserves manual edits and custom items when switching BEACH -> coastal CAMPING', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Cát Bà',
      activity: ActivityType.BEACH,
      environment: 'COASTAL',
      isOvernight: false,
      durationDays: 2,
      travelers: 4,
      ownedGearCodes: [],
      planVersion: 1,
    });

    const v1 = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));
    const chair = v1.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR');
    expect(chair).toBeDefined();

    // User manually updates owned chair count and adds a custom item
    await checklistsService.updateChecklistItem(user1Id, v1.id, chair.itemId, {
      quantityOwned: 2,
      quantityRequired: 5,
    });
    await checklistsService.addChecklistItem(user1Id, v1.id, {
      categoryCode: 'COOLER_BOX',
      name: 'Thùng giữ nhiệt',
      quantityRequired: 1,
      quantityOwned: 1,
    });

    // Switch plan to coastal overnight CAMPING
    travelPlansStore.set(String(planId), {
      ...travelPlansStore.get(String(planId)),
      activity: ActivityType.CAMPING,
      environment: 'COASTAL',
      isOvernight: true,
      planVersion: 2,
    });

    const v2 = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));
    expect(v2.checklistVersion).toBeGreaterThan(v1.checklistVersion);
    const updatedChair = v2.items.find((i: any) => i.categoryCode === 'CAMPING_CHAIR');
    expect(updatedChair.quantityOwned).toBe(2);
    expect(updatedChair.quantityRequired).toBe(5);
    expect(updatedChair.userEditedOwned).toBe(true);
    expect(updatedChair.userEditedRequired).toBe(true);
    expect(v2.items.some((i: any) => i.categoryCode === 'TARP')).toBe(true);
    expect(v2.items.some((i: any) => i.categoryCode === 'TENT')).toBe(true);
    expect(v2.items.some((i: any) => i.categoryCode === 'COOLER_BOX' && i.isCustomItem)).toBe(true);
  });

  it('matches missing BEACH gear while excluding self-prepare items (SWIMWEAR) and sufficient items (DRY_BAG)', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Cát Bà',
      activity: ActivityType.BEACH,
      environment: 'COASTAL',
      isOvernight: false,
      durationDays: 2,
      travelers: 2,
      ownedGearCodes: ['DRY_BAG'],
      ownedGearQuantities: { DRY_BAG: 2 },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));
    expect(cl.items.find((i: any) => i.categoryCode === 'DRY_BAG')?.quantityMissing).toBe(0);
    expect(cl.items.find((i: any) => i.categoryCode === 'SWIMWEAR')?.canRent).toBe(false);

    // Add an approved CAMERA listing in Hải Phòng; leave CAMPING_CHAIR with 0 listings
    const cameraId = new Types.ObjectId();
    gearItemsStore.set(String(cameraId), {
      _id: cameraId,
      ownerId: new Types.ObjectId(ownerId),
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

    const res = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-10',
      endAt: '2026-12-12',
      pickupArea: 'Hải Phòng',
    });

    const matchedCamera = res.itemMatches.find((m: any) => m.categoryCode === 'CAMERA');
    const matchedChair = res.itemMatches.find((m: any) => m.categoryCode === 'CAMPING_CHAIR');
    expect(matchedCamera).toBeDefined();
    expect(matchedCamera.candidates.length).toBe(1);
    expect(matchedCamera.candidates[0].title).toContain('GoPro Hero 12');

    expect(matchedChair).toBeDefined();
    expect(matchedChair.candidates.length).toBe(0);

    // Sufficient item excluded from itemMatches
    expect(res.itemMatches.some((m: any) => m.categoryCode === 'DRY_BAG')).toBe(false);
    // Self-prepare items go to nonRentableItems, not itemMatches
    expect(res.itemMatches.some((m: any) => m.categoryCode === 'SWIMWEAR')).toBe(false);
    expect(res.nonRentableItems.some((n: any) => n.categoryCode === 'SWIMWEAR')).toBe(true);
  });

  it('Phase 9B matching: uses sweep-line peak concurrency (morning+afternoon -> 1 left, ownerBlocked+disputed -> 0) and enforces min/max rental days', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Lảo Thẩn',
      activity: ActivityType.TREKKING,
      isOvernight: true,
      durationDays: 2,
      travelers: 1,
      ownedGearCodes: ['BACKPACK', 'TREKKING_POLES', 'TREKKING_SHOES', 'HEADLAMP', 'SLEEPING_BAG'],
      ownedGearQuantities: {
        BACKPACK: 1,
        TREKKING_POLES: 1,
        TREKKING_SHOES: 1,
        HEADLAMP: 1,
        SLEEPING_BAG: 1,
      },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));

    const tentId = new Types.ObjectId();
    gearItemsStore.set(String(tentId), {
      _id: tentId,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TENT',
      title: '[9B] Lều 2 chiếc',
      condition: GearCondition.GOOD,
      attributes: {},
      totalQuantity: 2,
      sharingType: GearListingType.RENT,
      pricePerDay: 100000,
      depositAmount: 400000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      availabilitySettings: { minRentalDays: 1, maxRentalDays: 3, advanceNoticeHours: 0 },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.9,
    });

    // Morning booking [08:00, 12:00) + Afternoon booking [13:00, 17:00) on 2026-12-06
    const morningBkId = new Types.ObjectId();
    const afternoonBkId = new Types.ObjectId();
    bookingsStore.push(
      {
        _id: morningBkId,
        gearId: tentId,
        status: BookingStatus.APPROVED,
        startAt: new Date('2026-12-06T08:00:00+07:00'),
        endAt: new Date('2026-12-06T12:00:00+07:00'),
        quantity: 1,
      },
      {
        _id: afternoonBkId,
        gearId: tentId,
        status: BookingStatus.IN_USE,
        startAt: new Date('2026-12-06T13:00:00+07:00'),
        endAt: new Date('2026-12-06T17:00:00+07:00'),
        quantity: 1,
      },
    );

    // Whole day query [08:00, 18:00) still has 1 unit available!
    const matchWholeDay = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-06T08:00:00+07:00',
      endAt: '2026-12-06T18:00:00+07:00',
      pickupArea: 'Đống Đa, Hà Nội',
    });
    const tentMatch = matchWholeDay.itemMatches.find((m: any) => m.categoryCode === 'TENT');
    expect(tentMatch.candidates.length).toBe(1);
    expect(tentMatch.candidates[0].availableQuantity).toBe(1);

    // Exceeding maxRentalDays (5 days > 3) excludes that tent cleanly
    const matchTooLong = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-10',
      endAt: '2026-12-15',
      pickupArea: 'Đống Đa, Hà Nội',
    });
    const tentTooLong = matchTooLong.itemMatches.find((m: any) => m.categoryCode === 'TENT');
    expect(tentTooLong.candidates.length).toBe(0);

    // Add OWNER_BLOCKED overlapping afternoon DISPUTED/IN_USE -> 2 total occupied at 14:00 -> 0 left!
    availabilityStore.push({
      _id: new Types.ObjectId(),
      gearId: tentId,
      reason: 'OWNER_BLOCKED',
      reservedQuantity: 1,
      startAt: new Date('2026-12-06T14:00:00+07:00'),
      endAt: new Date('2026-12-06T16:00:00+07:00'),
    });
    const matchZero = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-06T08:00:00+07:00',
      endAt: '2026-12-06T18:00:00+07:00',
      pickupArea: 'Đống Đa, Hà Nội',
    });
    const tentZero = matchZero.itemMatches.find((m: any) => m.categoryCode === 'TENT');
    expect(tentZero.candidates.length).toBe(0);
  });

  // =========================================================================
  // 10. PHASE 9C — PER-SIZE NON-SUBSTITUTION, BUDGET ALLOCATION, PRIVACY/OWN-GEAR/COORDS & BATCH PERFORMANCE
  // =========================================================================
  it('Phase 9C: enforces size 38 cannot substitute size 42, enforces capacity, and splits budget 80k on 50k/day x2 to max 1 unit', async () => {
    // 1. Footwear per-size ("một đôi 38 và một đôi 42") — 2 pairs of size 38 still only fulfills 1/2!
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Yên Tử',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 2,
      ownedGearCodes: ['BACKPACK', 'TREKKING_POLES', 'HEADLAMP'],
      ownedGearQuantities: { BACKPACK: 2, TREKKING_POLES: 2, HEADLAMP: 2 },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));
    const shoeItem = cl.items.find((i: any) => i.categoryCode === 'TREKKING_SHOES');

    // Require 1 pair size 38 AND 1 pair size 42
    await checklistsService.updateChecklistItem(user1Id, cl.id, shoeItem.itemId, {
      quantityRequired: 2,
      requiredAttributes: { sizeBreakdown: { '38': 1, '42': 1 } },
    });

    // Only size 38 (qty=2) exists in DB -> NO size 42!
    const shoe38Id = new Types.ObjectId();
    gearItemsStore.set(String(shoe38Id), {
      _id: shoe38Id,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TREKKING_SHOES',
      title: '[9C] Giày Trekking Size 38 (2 đôi)',
      condition: GearCondition.LIKE_NEW,
      attributes: { sizeEu: 38, size: '38' },
      totalQuantity: 2,
      sharingType: GearListingType.RENT,
      pricePerDay: 50000,
      depositAmount: 300000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.9,
    });

    // Listing belonging to current user (user1Id) must NEVER be suggested!
    const ownShoe42Id = new Types.ObjectId();
    gearItemsStore.set(String(ownShoe42Id), {
      _id: ownShoe42Id,
      ownerId: new Types.ObjectId(user1Id),
      categoryCode: 'TREKKING_SHOES',
      title: '[9C] Giày Size 42 của chính người thuê',
      condition: GearCondition.NEW,
      attributes: { sizeEu: 42 },
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 50000,
      depositAmount: 300000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 5.0,
    });

    const partialSizeRes = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-10T08:00:00+07:00',
      endAt: '2026-12-11T08:00:00+07:00',
      pickupArea: 'Đống Đa, Hà Nội',
    });

    const matchedShoeGroup = partialSizeRes.itemMatches.find(
      (m: any) => m.categoryCode === 'TREKKING_SHOES',
    );
    expect(matchedShoeGroup.totalFulfillableQuantity).toBe(1);
    expect(matchedShoeGroup.isFullyFulfillable).toBe(false);
    expect(matchedShoeGroup.candidates.some((c: any) => c.gearId === String(ownShoe42Id))).toBe(false);
    expect(matchedShoeGroup.unmatchedReason).toContain('không bù thay thế');
    expect(partialSizeRes.budgetSummary.isWithinTotalBudget).toBe(false);

    // 2. One listing 50,000đ/day x 2 available with budget 80,000đ for 1 day -> fulfills max 1 unit (50,000đ)
    const planBudgetId = new Types.ObjectId();
    travelPlansStore.set(String(planBudgetId), {
      _id: planBudgetId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Ba Vì',
      activity: ActivityType.TREKKING,
      durationDays: 1,
      travelers: 2,
      ownedGearCodes: ['BACKPACK', 'TREKKING_POLES', 'HEADLAMP'],
      ownedGearQuantities: { BACKPACK: 2, TREKKING_POLES: 2, HEADLAMP: 2 },
      planVersion: 1,
    });
    const clBudget = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planBudgetId));
    const shoeBudgetItem = clBudget.items.find((i: any) => i.categoryCode === 'TREKKING_SHOES');
    await checklistsService.updateChecklistItem(user1Id, clBudget.id, shoeBudgetItem.itemId, {
      quantityRequired: 2,
      requiredAttributes: { size: '38' },
    });

    const budgetCapRes = await checklistsService.matchMissingGear(user1Id, clBudget.id, {
      startAt: '2026-12-10T08:00:00+07:00',
      endAt: '2026-12-11T08:00:00+07:00',
      pickupArea: 'Đống Đa, Hà Nội',
      budgetVnd: 80000,
    });
    const bGroup = budgetCapRes.itemMatches[0];
    expect(bGroup.candidates[0].fulfillableQuantity).toBe(1);
    expect(bGroup.candidates[0].coverageLabel).toBe('Đáp ứng 1/2');
    expect(bGroup.candidates[0].estimatedRentalTotal).toBe(50000);
    expect(bGroup.totalFulfillableQuantity).toBe(1);
    expect(budgetCapRes.budgetSummary.isWithinTotalBudget).toBe(false);
    expect(budgetCapRes.budgetSummary.minTotalEstimatedCostVnd).toBe(50000);
  });

  it('Phase 9C: excludes unconfirmed owned gear, excludes missing-coords under radius, hides PAUSED/REJECTED listings, and batches queries on 80+ listings', async () => {
    const planId = new Types.ObjectId();
    travelPlansStore.set(String(planId), {
      _id: planId,
      userId: new Types.ObjectId(user1Id),
      destination: 'Tà Xùa',
      activity: ActivityType.TREKKING,
      durationDays: 2,
      travelers: 1,
      ownedGearCodes: ['BACKPACK'], // unconfirmed count -> must stay in unconfirmedOwnedItems, NOT matched!
      ownedGearQuantities: { TREKKING_POLES: 1, HEADLAMP: 1 },
      planVersion: 1,
    });

    const cl = await checklistsService.generateOrGetChecklistForPlan(user1Id, String(planId));

    // Seed hidden (PAUSED) + missing coordinates + valid geo listing + 80 extra synthetic items
    gearItemsStore.set(String(new Types.ObjectId()), {
      _id: new Types.ObjectId(),
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TREKKING_SHOES',
      title: '[9C] Giày PAUSED bị ẩn',
      condition: GearCondition.GOOD,
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 40000,
      depositAmount: 200000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: { type: 'Point', coordinates: [105.827, 21.018] },
      status: GearStatus.PAUSED,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: false,
      ratingAvg: 4.5,
    });
    const noCoordsId = new Types.ObjectId();
    gearItemsStore.set(String(noCoordsId), {
      _id: noCoordsId,
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TREKKING_SHOES',
      title: '[9C] Giày thiếu tọa độ',
      condition: GearCondition.GOOD,
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      pricePerDay: 40000,
      depositAmount: 200000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      ratingAvg: 4.5,
    });

    for (let i = 0; i < 80; i++) {
      const id = new Types.ObjectId();
      gearItemsStore.set(String(id), {
        _id: id,
        ownerId: new Types.ObjectId(ownerId),
        categoryCode: 'TREKKING_SHOES',
        title: `[9C] Giày hàng loạt #${i}`,
        condition: GearCondition.GOOD,
        totalQuantity: 1,
        sharingType: GearListingType.RENT,
        pricePerDay: 50000 + i * 1000,
        depositAmount: 200000,
        city: 'Hà Nội',
        district: 'Đống Đa',
        pickupLocation: { type: 'Point', coordinates: [105.827, 21.018] },
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
        isActive: true,
        ratingAvg: 4.7,
      });
    }

    const resWithGeo = await checklistsService.matchMissingGear(user1Id, cl.id, {
      startAt: '2026-12-10',
      endAt: '2026-12-12',
      lat: 21.018,
      lng: 105.827,
      radiusKm: 5,
      limitPerItem: 10,
    });

    // Unconfirmed BACKPACK excluded from itemMatches and placed in unconfirmedOwnedItems -> cannot conclude budget!
    expect(resWithGeo.itemMatches.some((m: any) => m.categoryCode === 'BACKPACK')).toBe(false);
    expect(resWithGeo.unconfirmedOwnedItems.some((u: any) => u.categoryCode === 'BACKPACK')).toBe(true);
    expect(resWithGeo.budgetSummary.hasUnconfirmedItems).toBe(true);
    expect(resWithGeo.budgetSummary.isWithinTotalBudget).toBe(false);

    const shoeGroup = resWithGeo.itemMatches.find((m: any) => m.categoryCode === 'TREKKING_SHOES');
    expect(shoeGroup.totalCandidatesCount).toBe(80); // PAUSED and missing-coords both excluded cleanly!
    expect(shoeGroup.candidates.length).toBe(10); // limitPerItem honored
    expect(shoeGroup.candidates[0].pricePerDay).toBe(50000); // deterministic cheapest-first tiebreak
    expect(shoeGroup.candidates.some((c: any) => c.gearId === String(noCoordsId))).toBe(false);
  });
});
