import * as assert from 'assert';
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import * as path from 'path';
import {
  ActivityType,
  BookingStatus,
  DisputeReason,
  DisputeStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  UserRole,
} from '../common/enums/system.enums';
import {
  AiConversation,
  AiConversationSchema,
  Booking,
  BookingSchema,
  Checklist,
  ChecklistSchema,
  Dispute,
  DisputeSchema,
  GearAvailability,
  GearAvailabilitySchema,
  GearCategory,
  GearCategorySchema,
  GearItem,
  GearItemSchema,
  GearRule,
  GearRuleSchema,
  Handover,
  HandoverSchema,
  Profile,
  ProfileSchema,
  Review,
  ReviewSchema,
  TravelPlan,
  TravelPlanSchema,
} from './schemas';
import { AvailabilityService } from '../modules/gear/availability.service';
import { GearService } from '../modules/gear/gear.service';
import { BookingsService } from '../modules/bookings/bookings.service';
import { BookingEventsService } from '../modules/bookings/booking-events.service';
import { ChecklistsService } from '../modules/checklists/checklists.service';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

function registerModels(conn: mongoose.Connection) {
  return {
    GearCategoryModel: conn.model(GearCategory.name, GearCategorySchema) as any,
    GearItemModel: conn.model(GearItem.name, GearItemSchema) as any,
    GearAvailabilityModel: conn.model(
      GearAvailability.name,
      GearAvailabilitySchema,
    ) as any,
    BookingModel: conn.model(Booking.name, BookingSchema) as any,
    HandoverModel: conn.model(Handover.name, HandoverSchema) as any,
    ReviewModel: conn.model(Review.name, ReviewSchema) as any,
    DisputeModel: conn.model(Dispute.name, DisputeSchema) as any,
    ProfileModel: conn.model(Profile.name, ProfileSchema) as any,
    TravelPlanModel: conn.model(TravelPlan.name, TravelPlanSchema) as any,
    ChecklistModel: conn.model(Checklist.name, ChecklistSchema) as any,
    AiConversationModel: conn.model(
      AiConversation.name,
      AiConversationSchema,
    ) as any,
    GearRuleModel: conn.model(GearRule.name, GearRuleSchema) as any,
  };
}

function buildServiceStack(conn: mongoose.Connection) {
  const m = registerModels(conn);
  const availabilityService = new AvailabilityService(
    m.GearAvailabilityModel,
    m.GearItemModel,
    m.BookingModel,
    conn,
  );
  const gearService = new GearService(
    m.GearCategoryModel,
    m.GearItemModel,
    m.ProfileModel,
    m.BookingModel,
    availabilityService,
  );
  const eventsService = new BookingEventsService();
  const bookingsService = new BookingsService(
    m.BookingModel,
    m.GearItemModel,
    m.HandoverModel,
    m.ReviewModel,
    m.DisputeModel,
    m.ProfileModel,
    availabilityService,
    eventsService,
  );
  const checklistsService = new ChecklistsService(
    m.TravelPlanModel,
    m.ChecklistModel,
    m.AiConversationModel,
    m.GearRuleModel,
    m.GearItemModel,
    m.GearAvailabilityModel,
    m.BookingModel,
    m.ProfileModel,
    availabilityService,
  );
  return {
    models: m,
    availabilityService,
    gearService,
    bookingsService,
    checklistsService,
  };
}

async function runPhase9bReplicaVerification() {
  const baseUri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/travelshare';
  const mongoUri = baseUri.includes('directConnection=')
    ? baseUri.replace(/directConnection=true/gi, 'directConnection=false')
    : baseUri;

  console.log(`[Verify 9B] Đang kết nối hai Mongoose connections tới: ${mongoUri}`);
  const connA = await mongoose.createConnection(mongoUri).asPromise();
  const connB = await mongoose.createConnection(mongoUri).asPromise();

  const createdGearIds: mongoose.Types.ObjectId[] = [];
  const createdBookingIds: mongoose.Types.ObjectId[] = [];
  const createdPlanIds: mongoose.Types.ObjectId[] = [];
  const createdChecklistIds: mongoose.Types.ObjectId[] = [];
  const createdProfileUserIds: mongoose.Types.ObjectId[] = [];
  let createdCategoryId: mongoose.Types.ObjectId | null = null;

  const stackA = buildServiceStack(connA);
  const stackB = buildServiceStack(connB);

  try {
    // Ensure replica set session/transactions are supported
    const testSess = await connA.startSession();
    try {
      await testSess.withTransaction(async () => {
        await stackA.models.GearCategoryModel.findOne({}).session(testSess).lean();
      });
    } finally {
      await testSess.endSession();
    }
    console.log('[Verify 9B] ✅ Đã xác nhận MongoDB Replica Set hỗ trợ Transaction.');

    const ownerId = new mongoose.Types.ObjectId();
    const renter1Id = new mongoose.Types.ObjectId();
    const renter2Id = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();
    createdProfileUserIds.push(ownerId, renter1Id, renter2Id, adminId);

    await stackA.models.ProfileModel.insertMany([
      { userId: ownerId, username: `v9b_owner_${ownerId.toString().slice(-5)}`, fullName: '[9B] Chủ đồ', city: 'Hà Nội', district: 'Đống Đa', trustScore: 5 },
      { userId: renter1Id, username: `v9b_r1_${renter1Id.toString().slice(-5)}`, fullName: '[9B] Người thuê 1', city: 'Hà Nội', district: 'Đống Đa', trustScore: 5 },
      { userId: renter2Id, username: `v9b_r2_${renter2Id.toString().slice(-5)}`, fullName: '[9B] Người thuê 2', city: 'Hà Nội', district: 'Đống Đa', trustScore: 5 },
    ]);

    let cat = await stackA.models.GearCategoryModel.findOne({ code: 'TENT' }).lean();
    if (!cat) {
      const cDoc = await stackA.models.GearCategoryModel.create({
        code: `TENT_V9B_${Date.now()}`,
        name: '[9B] Lều dã ngoại',
        slug: `tent-v9b-${Date.now()}`,
        isActive: true,
      });
      cat = cDoc.toObject();
      createdCategoryId = cDoc._id as mongoose.Types.ObjectId;
    }

    // -----------------------------------------------------------------------
    // CASE 1: Concurrent approval race across TWO independent service stacks on last unit
    // -----------------------------------------------------------------------
    const gearLastUnit = await stackA.models.GearItemModel.create({
      ownerId,
      categoryId: cat._id,
      categoryCode: cat.code,
      title: '[VERIFY_9B] Lều 1 chiếc tranh cuối',
      description: 'Test race condition Phase 9B',
      condition: GearCondition.LIKE_NEW,
      totalQuantity: 1,
      reservationVersion: 0,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 120000,
      dailyPriceVnd: 120000,
      depositAmount: 500000,
      depositAmountVnd: 500000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: { type: 'Point', coordinates: [105.827, 21.018] },
      availabilitySettings: { minRentalDays: 1, maxRentalDays: 14, advanceNoticeHours: 0 },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
    });
    createdGearIds.push(gearLastUnit._id as mongoose.Types.ObjectId);

    const b1 = await stackA.bookingsService.createBooking(String(renter1Id), {
      gearId: String(gearLastUnit._id),
      startAt: '2026-12-20T00:00:00.000+07:00',
      endAt: '2026-12-22T00:00:00.000+07:00',
      quantity: 1,
    });
    const b2 = await stackB.bookingsService.createBooking(String(renter2Id), {
      gearId: String(gearLastUnit._id),
      startAt: '2026-12-20T00:00:00.000+07:00',
      endAt: '2026-12-22T00:00:00.000+07:00',
      quantity: 1,
    });
    createdBookingIds.push(new mongoose.Types.ObjectId(b1.id), new mongoose.Types.ObjectId(b2.id));

    const raceApprove = await Promise.allSettled([
      stackA.bookingsService.approveBooking(b1.id, String(ownerId), UserRole.USER, {
        note: 'Duyệt đơn 1',
        internalNote: 'Ghi chú nội bộ 9B',
      }),
      stackB.bookingsService.approveBooking(b2.id, String(ownerId), UserRole.USER, {
        note: 'Duyệt đơn 2',
      }),
    ]);
    const approveSuccessCount = raceApprove.filter((r) => r.status === 'fulfilled').length;
    assert.strictEqual(approveSuccessCount, 1, 'Chi duoc phep co dung 1 luot duyet tranh chiec cuoi thanh cong');
    const bookedSlotsAfterRace = await stackA.models.GearAvailabilityModel.countDocuments({
      gearId: gearLastUnit._id,
      reason: 'BOOKED',
    });
    assert.strictEqual(bookedSlotsAfterRace, 1, 'Chi duoc phep co 1 BOOKED slot');
    console.log('[Verify 9B] ✅ Case 1 PASS: Hai luot duyet tranh chiec cuoi qua 2 instance chi co 1 thanh cong.');

    // -----------------------------------------------------------------------
    // CASE 2: Fault injection during recordBookedSlot -> full transaction rollback, ZERO partial APPROVED booking
    // -----------------------------------------------------------------------
    const bRollback = await stackA.bookingsService.createBooking(String(renter1Id), {
      gearId: String(gearLastUnit._id),
      startAt: '2026-12-25T00:00:00.000+07:00',
      endAt: '2026-12-27T00:00:00.000+07:00',
      quantity: 1,
    });
    createdBookingIds.push(new mongoose.Types.ObjectId(bRollback.id));

    const origRecord = stackA.availabilityService.recordBookedSlot.bind(stackA.availabilityService);
    stackA.availabilityService.recordBookedSlot = async () => {
      throw new Error('[VERIFY_9B] Simulated write failure on GearAvailability inside transaction');
    };
    let threwOnSlotFail = false;
    try {
      await stackA.bookingsService.approveBooking(bRollback.id, String(ownerId), UserRole.USER);
    } catch {
      threwOnSlotFail = true;
    } finally {
      stackA.availabilityService.recordBookedSlot = origRecord;
    }
    assert.strictEqual(threwOnSlotFail, true, 'Phai nem loi khi ghi lich that bai');
    const freshRollbackDoc = await stackA.models.BookingModel.findById(bRollback.id).lean();
    assert.strictEqual(freshRollbackDoc?.status, BookingStatus.PENDING, 'Booking phai rollback ve PENDING, khong duoc de APPROVED do');
    console.log('[Verify 9B] ✅ Case 2 PASS: Loi ghi lich rollback transaction, khong con booking APPROVED ghi do.');

    // -----------------------------------------------------------------------
    // CASE 3 & 4: Multi-unit qty=2 (morning + afternoon = 1 left; OWNER_BLOCKED + APPROVED overlap = 0 left)
    //             Verified across Marketplace, Gear Detail, Checklist Matching & Booking!
    // -----------------------------------------------------------------------
    const gearTwoUnits = await stackA.models.GearItemModel.create({
      ownerId,
      categoryId: cat._id,
      categoryCode: 'TENT',
      title: '[VERIFY_9B] Lều Tồn 2 Chiếc Đồng Bộ',
      description: 'Test sweep-line multi-unit Phase 9B',
      condition: GearCondition.GOOD,
      totalQuantity: 2,
      reservationVersion: 0,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 90000,
      dailyPriceVnd: 90000,
      depositAmount: 300000,
      depositAmountVnd: 300000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: { type: 'Point', coordinates: [105.827, 21.018] },
      availabilitySettings: { minRentalDays: 1, maxRentalDays: 14, advanceNoticeHours: 0 },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
    });
    createdGearIds.push(gearTwoUnits._id as mongoose.Types.ObjectId);

    const morningBk = await stackA.bookingsService.createBooking(String(renter1Id), {
      gearId: String(gearTwoUnits._id),
      startAt: '2026-12-06T08:00:00+07:00',
      endAt: '2026-12-06T12:00:00+07:00',
      quantity: 1,
    });
    const afternoonBk = await stackB.bookingsService.createBooking(String(renter2Id), {
      gearId: String(gearTwoUnits._id),
      startAt: '2026-12-06T13:00:00+07:00',
      endAt: '2026-12-06T17:00:00+07:00',
      quantity: 1,
    });
    createdBookingIds.push(new mongoose.Types.ObjectId(morningBk.id), new mongoose.Types.ObjectId(afternoonBk.id));
    await stackA.bookingsService.approveBooking(morningBk.id, String(ownerId), UserRole.USER);
    await stackB.bookingsService.approveBooking(afternoonBk.id, String(ownerId), UserRole.USER);

    const planDoc = await stackA.models.TravelPlanModel.create({
      userId: renter1Id,
      destination: 'Ba Vì',
      activity: ActivityType.CAMPING,
      isOvernight: true,
      durationDays: 1,
      travelers: 1,
      ownedGearCodes: [],
      planVersion: 1,
    });
    createdPlanIds.push(planDoc._id as mongoose.Types.ObjectId);
    const checklistRes = await stackA.checklistsService.generateOrGetChecklistForPlan(
      String(renter1Id),
      String(planDoc._id),
    );
    createdChecklistIds.push(new mongoose.Types.ObjectId(checklistRes.id));

    const dayStart = '2026-12-06T08:00:00+07:00';
    const dayEnd = '2026-12-06T18:00:00+07:00';

    const [detailWhole, marketWhole, matchWhole] = await Promise.all([
      stackA.availabilityService.getGearAvailability(String(gearTwoUnits._id), { startAt: dayStart, endAt: dayEnd, quantity: 1 }),
      stackA.gearService.searchGear({ q: '[VERIFY_9B] Lều Tồn 2 Chiếc Đồng Bộ', startAt: dayStart, endAt: dayEnd, quantity: 1 }),
      stackA.checklistsService.matchMissingGear(String(renter1Id), checklistRes.id, { startAt: dayStart, endAt: dayEnd, pickupArea: 'Đống Đa, Hà Nội' }),
    ]);

    assert.strictEqual(detailWhole.availableQuantity, 1, 'Chi tiet: don sang + chieu phai con 1 chiec');
    const foundMarket = marketWhole.items.find((i: any) => i.id === String(gearTwoUnits._id));
    assert.strictEqual(foundMarket?.availableQuantity, 1, 'Marketplace: don sang + chieu phai con 1 chiec');
    const tentCatMatch = matchWhole.itemMatches.find((m: any) => m.categoryCode === 'TENT');
    const foundMatch = tentCatMatch?.candidates.find((c: any) => c.gearId === String(gearTwoUnits._id));
    assert.strictEqual(foundMatch?.availableQuantity, 1, 'Matching: don sang + chieu phai con 1 chiec');
    console.log('[Verify 9B] ✅ Case 3 PASS: Ton 2 (don sang + don chieu) dong nhat con 1 tren 4 be mat.');

    // Case 4: Lock 1 unit in morning [09:00, 11:00) overlapping approved morningBk -> remaining = 0 across all 4 surfaces!
    await stackB.availabilityService.addUnavailablePeriod(String(ownerId), UserRole.USER, String(gearTwoUnits._id), {
      startAt: '2026-12-06T09:00:00+07:00',
      endAt: '2026-12-06T11:00:00+07:00',
      reservedQuantity: 1,
      note: 'Khóa nội bộ trùng buổi sáng',
    });
    const mStart = '2026-12-06T09:00:00+07:00';
    const mEnd = '2026-12-06T11:00:00+07:00';
    const [detailZero, marketZero, matchZero] = await Promise.all([
      stackA.availabilityService.getGearAvailability(String(gearTwoUnits._id), { startAt: mStart, endAt: mEnd, quantity: 1 }),
      stackA.gearService.searchGear({ q: '[VERIFY_9B] Lều Tồn 2 Chiếc Đồng Bộ', startAt: mStart, endAt: mEnd, quantity: 1 }),
      stackA.checklistsService.matchMissingGear(String(renter1Id), checklistRes.id, { startAt: mStart, endAt: mEnd, pickupArea: 'Đống Đa, Hà Nội' }),
    ]);
    assert.strictEqual(detailZero.availableQuantity, 0, 'Chi tiet: khoa 1 + thue 1 phai con 0');
    assert.strictEqual(marketZero.items.some((i: any) => i.id === String(gearTwoUnits._id)), false, 'Marketplace phai an khi con 0');
    const zeroTentMatch = matchZero.itemMatches.find((m: any) => m.categoryCode === 'TENT');
    assert.strictEqual(zeroTentMatch?.candidates.some((c: any) => c.gearId === String(gearTwoUnits._id)), false, 'Matching phai loai khi con 0');

    let blockedZeroBooking = false;
    try {
      await stackA.bookingsService.createBooking(String(renter1Id), {
        gearId: String(gearTwoUnits._id),
        startAt: mStart,
        endAt: mEnd,
        quantity: 1,
      });
    } catch {
      blockedZeroBooking = true;
    }
    assert.strictEqual(blockedZeroBooking, true, 'Create booking phai bi chan khi con 0');
    console.log('[Verify 9B] ✅ Case 4 PASS: 1 khoa + 1 thue cung khung gio dong nhat con 0 tren ca Marketplace, Chi tiet, Matching & Booking.');

    // -----------------------------------------------------------------------
    // CASE 5: Owner manual lock racing simultaneously with booking approval on remaining 1 unit on Dec 18
    // -----------------------------------------------------------------------
    const raceDec18Bk = await stackA.bookingsService.createBooking(String(renter1Id), {
      gearId: String(gearLastUnit._id),
      startAt: '2026-12-18',
      endAt: '2026-12-19',
      quantity: 1,
    });
    createdBookingIds.push(new mongoose.Types.ObjectId(raceDec18Bk.id));

    const lockVsApprove = await Promise.allSettled([
      stackA.availabilityService.addUnavailablePeriod(String(ownerId), UserRole.USER, String(gearLastUnit._id), {
        startAt: '2026-12-18',
        endAt: '2026-12-19',
        reservedQuantity: 1,
        note: 'Chủ đồ giữ dùng gấp',
      }),
      stackB.bookingsService.approveBooking(raceDec18Bk.id, String(ownerId), UserRole.USER),
    ]);
    assert.strictEqual(
      lockVsApprove.filter((r) => r.status === 'fulfilled').length,
      1,
      'Khoa lich dong thoi voi duyet booking chi duoc 1 thao tac thanh cong',
    );
    console.log('[Verify 9B] ✅ Case 5 PASS: Khoa lich thu cong dong thoi voi duyet booking qua 2 instance chi co 1 thanh cong.');

    // -----------------------------------------------------------------------
    // CASE 6: Public calendar sanitization + renter vs owner internal note check
    // -----------------------------------------------------------------------
    const pubCal = await stackA.availabilityService.getGearAvailability(String(gearLastUnit._id));
    assert.ok(pubCal.periods.length >= 1, 'Lich cong khai phai co it nhat 1 period');
    assert.strictEqual(pubCal.periods[0].note, undefined, 'Lich cong khai khong duoc lo ghi chu chu do');
    assert.strictEqual(pubCal.periods[0].bookingId, undefined, 'Lich cong khai khong duoc lo bookingId');

    const renterBkView = await stackA.bookingsService.getBookingById(
      raceApprove[0].status === 'fulfilled' ? b1.id : b2.id,
      raceApprove[0].status === 'fulfilled' ? String(renter1Id) : String(renter2Id),
      UserRole.USER,
    );
    assert.strictEqual(renterBkView.ownerInternalNote, undefined, 'Nguoi thue khong duoc xem ownerInternalNote');
    console.log('[Verify 9B] ✅ Case 6 PASS: Phan quyen lich cong khai & ghi chu noi bo hoat dong dung.');
  } finally {
    // Cleanup temporary [VERIFY_9B] records
    await Promise.all([
      createdGearIds.length
        ? stackA.models.GearAvailabilityModel.deleteMany({ gearId: { $in: createdGearIds } })
        : Promise.resolve(),
      createdBookingIds.length
        ? stackA.models.BookingModel.deleteMany({ _id: { $in: createdBookingIds } })
        : Promise.resolve(),
      createdGearIds.length
        ? stackA.models.GearItemModel.deleteMany({ _id: { $in: createdGearIds } })
        : Promise.resolve(),
      createdChecklistIds.length
        ? stackA.models.ChecklistModel.deleteMany({ _id: { $in: createdChecklistIds } })
        : Promise.resolve(),
      createdPlanIds.length
        ? stackA.models.TravelPlanModel.deleteMany({ _id: { $in: createdPlanIds } })
        : Promise.resolve(),
      createdProfileUserIds.length
        ? stackA.models.ProfileModel.deleteMany({ userId: { $in: createdProfileUserIds } })
        : Promise.resolve(),
      createdCategoryId
        ? stackA.models.GearCategoryModel.deleteOne({ _id: createdCategoryId })
        : Promise.resolve(),
    ]);
    await Promise.all([connA.close(), connB.close()]);
  }
}

runPhase9bReplicaVerification()
  .then(() => {
    console.log('[Verify 9B] HOÀN TẤT TOÀN BỘ CA NGHIỆM THU REPLICA SET THẬT.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Verify 9B] THẤT BẠI:', err);
    process.exit(1);
  });
