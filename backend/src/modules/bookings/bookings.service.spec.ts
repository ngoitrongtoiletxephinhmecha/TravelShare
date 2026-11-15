import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingsService } from './bookings.service';
import { BookingEventsService } from './booking-events.service';
import { AvailabilityService } from '../gear/availability.service';
import {
  BookingStatus,
  DisputeReason,
  DisputeStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  HandoverType,
  UserRole,
} from '../../common/enums/system.enums';

describe('BookingsService & Double-Booking Prevention Suite (Phase 4)', () => {
  const ownerId = new Types.ObjectId().toString();
  const renterId1 = new Types.ObjectId().toString();
  const renterId2 = new Types.ObjectId().toString();
  const outsiderId = new Types.ObjectId().toString();
  const adminId = new Types.ObjectId().toString();
  const gearId = new Types.ObjectId().toString();

  // In-memory stateful collections to simulate real MongoDB state & atomic operations
  let gearsStore: Map<string, any>;
  let bookingsStore: Map<string, any>;
  let availabilityStore: Map<string, any>;
  let handoversStore: Map<string, any>;
  let reviewsStore: Map<string, any>;
  let disputesStore: Map<string, any>;
  let profilesStore: Map<string, any>;

  let service: BookingsService;
  let availabilityService: AvailabilityService;
  let eventsService: BookingEventsService;

  const makeChainable = (result: any) => ({
    lean: jest.fn().mockResolvedValue(result),
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
  });

  beforeEach(() => {
    gearsStore = new Map();
    bookingsStore = new Map();
    availabilityStore = new Map();
    handoversStore = new Map();
    reviewsStore = new Map();
    disputesStore = new Map();
    profilesStore = new Map();

    // Seed default active gear (totalQuantity = 1)
    gearsStore.set(gearId, {
      _id: new Types.ObjectId(gearId),
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TENT',
      title: 'Lều Naturehike Cloud Up 2 20D',
      brand: 'Naturehike',
      condition: GearCondition.LIKE_NEW,
      totalQuantity: 1,
      reservationVersion: 0,
      sharingType: GearListingType.RENT,
      pricePerDay: 100000,
      dailyPriceVnd: 100000,
      depositAmount: 500000,
      depositAmountVnd: 500000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: { type: 'Point', coordinates: [105.82, 21.01] },
      usageRules: ['Phơi khô trước khi trả'],
      images: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 14,
        advanceNoticeHours: 2,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
    });

    profilesStore.set(ownerId, {
      userId: new Types.ObjectId(ownerId),
      username: 'owner_vy',
      fullName: 'Lê Thảo Vy',
      trustScore: 5.0,
      completedBookingsCount: 0,
    });
    profilesStore.set(renterId1, {
      userId: new Types.ObjectId(renterId1),
      username: 'renter_quan',
      fullName: 'Trần Minh Quân',
      trustScore: 5.0,
      completedBookingsCount: 0,
    });
    profilesStore.set(renterId2, {
      userId: new Types.ObjectId(renterId2),
      username: 'renter_nam',
      fullName: 'Nguyễn Hoàng Nam',
      trustScore: 5.0,
      completedBookingsCount: 0,
    });

    const mockGearModel: any = {
      findById: jest.fn((id: any) => {
        const g = gearsStore.get(String(id)) || null;
        return makeChainable(g ? { ...g } : null);
      }),
      find: jest.fn(() => makeChainable(Array.from(gearsStore.values()))),
      findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
        const g = gearsStore.get(String(filter._id));
        if (!g) return null;
        if (filter.status && g.status !== filter.status) return null;
        if (filter.$or) {
          const expectedVer = filter.$or[0]?.reservationVersion;
          if (
            expectedVer !== undefined &&
            (g.reservationVersion || 0) !== expectedVer
          ) {
            return null;
          }
        }
        if (update.$inc?.reservationVersion) {
          g.reservationVersion =
            (g.reservationVersion || 0) + update.$inc.reservationVersion;
        }
        return { ...g };
      }),
      updateOne: jest.fn(async (filter: any, update: any) => {
        const g = gearsStore.get(String(filter._id));
        if (g && update.$set) {
          Object.assign(g, update.$set);
        }
        return { modifiedCount: 1 };
      }),
    };

    const mockBookingModel: any = {
      create: jest.fn(async (payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          ...payload,
          _id: id,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        bookingsStore.set(String(id), doc);
        return doc;
      }),
      findById: jest.fn((id: any) => {
        const b = bookingsStore.get(String(id)) || null;
        return makeChainable(b ? { ...b } : null);
      }),
      find: jest.fn((filter: any = {}) => {
        const all = Array.from(bookingsStore.values()).filter((b) => {
          if (filter.gearId && String(b.gearId) !== String(filter.gearId))
            return false;
          if (filter.renterId && String(b.renterId) !== String(filter.renterId))
            return false;
          if (filter.ownerId && String(b.ownerId) !== String(filter.ownerId))
            return false;
          if (filter._id?.$ne && String(b._id) === String(filter._id.$ne))
            return false;
          if (filter.status?.$in && !filter.status.$in.includes(b.status))
            return false;
          if (
            typeof filter.status === 'string' &&
            b.status !== filter.status
          )
            return false;
          if (filter.startAt?.$lt && !(b.startAt < filter.startAt.$lt))
            return false;
          if (filter.endAt?.$gt && !(b.endAt > filter.endAt.$gt)) return false;
          if (
            filter.expiresAt?.$lte &&
            !(b.expiresAt && b.expiresAt <= filter.expiresAt.$lte)
          )
            return false;
          return true;
        });
        return makeChainable(all);
      }),
      findOneAndUpdate: jest.fn((filter: any, update: any) => {
        const b = bookingsStore.get(String(filter._id));
        if (!b) return makeChainable(null);
        if (filter.status && b.status !== filter.status) {
          return makeChainable(null);
        }
        if (update.$set) {
          Object.assign(b, update.$set);
        }
        if (update.$push?.statusHistory) {
          b.statusHistory = [
            ...(b.statusHistory || []),
            update.$push.statusHistory,
          ];
        }
        return makeChainable({ ...b });
      }),
      updateOne: jest.fn(async (filter: any, update: any) => {
        const b = bookingsStore.get(String(filter._id));
        if (b) {
          if (update.$set) Object.assign(b, update.$set);
          if (update.$push?.statusHistory) {
            b.statusHistory = [
              ...(b.statusHistory || []),
              update.$push.statusHistory,
            ];
          }
        }
        return { modifiedCount: 1 };
      }),
      countDocuments: jest.fn(async () => bookingsStore.size),
    };

    const mockAvailabilityModel: any = {
      find: jest.fn((filter: any = {}) => {
        const list = Array.from(availabilityStore.values()).filter((p) => {
          if (filter.gearId && String(p.gearId) !== String(filter.gearId))
            return false;
          if (filter.reason && p.reason !== filter.reason) return false;
          if (filter.startAt?.$lt && !(p.startAt < filter.startAt.$lt))
            return false;
          if (filter.endAt?.$gt && !(p.endAt > filter.endAt.$gt)) return false;
          return true;
        });
        return makeChainable(list);
      }),
      create: jest.fn(async (payload: any) => {
        const item = Array.isArray(payload) ? payload[0] : payload;
        const id = new Types.ObjectId();
        const doc = { ...item, _id: id };
        availabilityStore.set(String(id), doc);
        return doc;
      }),
      deleteMany: jest.fn((filter: any) => {
        for (const [key, val] of availabilityStore.entries()) {
          if (
            filter.bookingId &&
            String(val.bookingId) === String(filter.bookingId)
          ) {
            availabilityStore.delete(key);
          }
        }
        return Promise.resolve({ deletedCount: 1 });
      }),
    };

    const mockHandoverModel: any = {
      findOne: jest.fn((filter: any) => {
        const key = `${String(filter.bookingId)}_${filter.handoverType}`;
        const h = handoversStore.get(key) || null;
        return makeChainable(h ? { ...h } : null);
      }),
      find: jest.fn((filter: any) => {
        const list = Array.from(handoversStore.values()).filter(
          (h) => String(h.bookingId) === String(filter.bookingId),
        );
        return makeChainable(list);
      }),
      findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
        const key = `${String(filter.bookingId)}_${filter.handoverType}`;
        const existing = handoversStore.get(key) || {
          _id: new Types.ObjectId(),
          bookingId: filter.bookingId,
          handoverType: filter.handoverType,
          createdAt: new Date(),
        };
        if (update.$set) {
          Object.assign(existing, update.$set);
        }
        handoversStore.set(key, existing);
        return existing;
      }),
    };

    const mockReviewModel: any = {
      findOne: jest.fn((filter: any) => {
        const key = `${String(filter.bookingId)}_${String(filter.reviewerId)}`;
        const r = reviewsStore.get(key) || null;
        return makeChainable(r);
      }),
      find: jest.fn((filter: any = {}) => {
        const list = Array.from(reviewsStore.values()).filter((r) => {
          if (filter.bookingId && !filter.bookingId.$in) {
            if (String(r.bookingId) !== String(filter.bookingId)) return false;
          }
          if (
            filter.targetUserId &&
            String(r.targetUserId) !== String(filter.targetUserId)
          )
            return false;
          if (filter.gearId && String(r.gearId) !== String(filter.gearId))
            return false;
          return true;
        });
        return makeChainable(list);
      }),
      create: jest.fn(async (payload: any) => {
        const key = `${String(payload.bookingId)}_${String(payload.reviewerId)}`;
        if (reviewsStore.has(key)) {
          const err: any = new Error('Duplicate review');
          err.code = 11000;
          throw err;
        }
        const doc = {
          ...payload,
          _id: new Types.ObjectId(),
          createdAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        reviewsStore.set(key, doc);
        return doc;
      }),
    };

    const mockDisputeModel: any = {
      findOne: jest.fn((filter: any) => {
        const key = `${String(filter.bookingId)}_${String(filter.reporterId)}`;
        return makeChainable(disputesStore.get(key) || null);
      }),
      find: jest.fn(() => makeChainable(Array.from(disputesStore.values()))),
      create: jest.fn(async (payload: any) => {
        const id = new Types.ObjectId();
        const doc = {
          ...payload,
          _id: id,
          createdAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        const key = `${String(payload.bookingId)}_${String(payload.reporterId)}`;
        disputesStore.set(key, doc);
        disputesStore.set(String(id), doc);
        return doc;
      }),
      findByIdAndUpdate: jest.fn((id: string, update: any) => {
        const doc = disputesStore.get(String(id));
        if (!doc) return makeChainable(null);
        if (update.$set) Object.assign(doc, update.$set);
        return makeChainable(doc);
      }),
    };

    const mockProfileModel: any = {
      find: jest.fn(() => makeChainable(Array.from(profilesStore.values()))),
      findOne: jest.fn((filter: any) => {
        if (filter.userId) {
          return makeChainable(
            profilesStore.get(String(filter.userId)) || null,
          );
        }
        return makeChainable(Array.from(profilesStore.values())[0] || null);
      }),
      updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    };

    availabilityService = new AvailabilityService(
      mockAvailabilityModel,
      mockGearModel,
    );
    eventsService = new BookingEventsService();

    service = new BookingsService(
      mockBookingModel,
      mockGearModel,
      mockHandoverModel,
      mockReviewModel,
      mockDisputeModel,
      mockProfileModel,
      availabilityService,
      eventsService,
    );
  });

  // 1. Tạo booking hợp lệ & FREE_LOAN có rentalTotal = 0
  it('1. creates a valid PENDING booking with server-computed snapshot pricing and FREE_LOAN = 0', async () => {
    const res = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
      quantity: 1,
      renterNote: 'Mình mượn lều đi Lảo Thẩn 2 ngày',
    });

    expect(res.status).toBe(BookingStatus.PENDING);
    expect(res.rentalDays).toBe(2);
    expect(res.priceSnapshot).toBe(100000);
    expect(res.rentalTotal).toBe(200000);
    expect(res.depositAmount).toBe(500000);
    expect(res.statusHistory).toHaveLength(1);

    // Test FREE_LOAN gear pricing = 0
    gearsStore.get(gearId).sharingType = GearListingType.FREE_LOAN;
    gearsStore.get(gearId).pricePerDay = 999999; // even if misconfigured, FREE_LOAN must yield 0
    const freeRes = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-10T00:00:00.000Z',
      endAt: '2026-12-12T00:00:00.000Z',
      quantity: 1,
    });
    expect(freeRes.rentalTotal).toBe(0);
    expect(freeRes.priceSnapshot).toBe(0);
  });

  // 2. Không được thuê đồ của chính mình
  it('2. rejects self-booking when renterId equals ownerId', async () => {
    await expect(
      service.createBooking(ownerId, {
        gearId,
        startAt: '2026-12-01T00:00:00.000Z',
        endAt: '2026-12-03T00:00:00.000Z',
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 3. Ngày thuê sai
  it('3. rejects invalid date intervals (startAt >= endAt or exceeding maxRentalDays)', async () => {
    await expect(
      service.createBooking(renterId1, {
        gearId,
        startAt: '2026-12-05T00:00:00.000Z',
        endAt: '2026-12-05T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createBooking(renterId1, {
        gearId,
        startAt: '2026-12-01T00:00:00.000Z',
        endAt: '2026-12-25T00:00:00.000Z', // 24 days > maxRentalDays (14)
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 4. Gear không hoạt động
  it('4. rejects booking creation when gear is PAUSED or DRAFT', async () => {
    gearsStore.get(gearId).status = GearStatus.PAUSED;

    await expect(
      service.createBooking(renterId1, {
        gearId,
        startAt: '2026-12-01T00:00:00.000Z',
        endAt: '2026-12-03T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 5 & 6. Trùng lịch + Hai booking APPROVE đồng thời (Double Booking Prevention)
  it('5 & 6. prevents double booking when two overlapping bookings are APPROVED concurrently', async () => {
    // Renter 1 and Renter 2 both submit PENDING requests for overlapping dates [Dec 1, Dec 3) and [Dec 2, Dec 4)
    const booking1 = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
      quantity: 1,
    });

    const booking2 = await service.createBooking(renterId2, {
      gearId,
      startAt: '2026-12-02T00:00:00.000Z',
      endAt: '2026-12-04T00:00:00.000Z',
      quantity: 1,
    });

    // Fire both approveBooking requests concurrently!
    const results = await Promise.allSettled([
      service.approveBooking(booking1.id, ownerId, UserRole.USER, {
        note: 'Approve 1',
      }),
      service.approveBooking(booking2.id, ownerId, UserRole.USER, {
        note: 'Approve 2',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly ONE must succeed and ONE must fail with ConflictException!
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    // Also verify any new booking request on overlapping dates now fails immediately on createBooking
    await expect(
      service.createBooking(renterId2, {
        gearId,
        startAt: '2026-12-01T12:00:00.000Z',
        endAt: '2026-12-02T12:00:00.000Z',
        quantity: 1,
      }),
    ).rejects.toThrow(ConflictException);

    // Adjacent interval [Dec 3, Dec 5) where startAt === previous endAt IS allowed by [startAt, endAt)
    const adjacentBooking = await service.createBooking(renterId2, {
      gearId,
      startAt: '2026-12-03T00:00:00.000Z',
      endAt: '2026-12-05T00:00:00.000Z',
      quantity: 1,
    });
    expect(adjacentBooking.status).toBe(BookingStatus.PENDING);
  });

  // 7 & 8. Owner approve/reject vs Unauthorized approve
  it('7 & 8. blocks non-owners from approving or rejecting a booking', async () => {
    const booking = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
    });

    // Renter tries to approve their own request -> ForbiddenException
    await expect(
      service.approveBooking(booking.id, renterId1, UserRole.USER),
    ).rejects.toThrow(ForbiddenException);

    // Outsider tries to approve -> ForbiddenException
    await expect(
      service.approveBooking(booking.id, outsiderId, UserRole.USER),
    ).rejects.toThrow(ForbiddenException);

    // Owner rejects -> REJECTED
    const rejected = await service.rejectBooking(
      booking.id,
      ownerId,
      UserRole.USER,
      { reason: 'Mình bận đi công tác' },
    );
    expect(rejected.status).toBe(BookingStatus.REJECTED);
  });

  // 9. Cancel hợp lệ và không hợp lệ + Giải phóng lịch
  it('9. allows cancellation in APPROVED and frees schedule, but blocks cancellation once IN_USE', async () => {
    const booking = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
    });

    await service.approveBooking(booking.id, ownerId, UserRole.USER);

    const cancelled = await service.cancelBooking(
      booking.id,
      renterId1,
      UserRole.USER,
      { reason: 'Hoãn chuyến đi do bão' },
    );
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);

    // Schedule must be freed so another renter can now book and get approved for [Dec 1, Dec 3)
    const rebooked = await service.createBooking(renterId2, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
    });
    const reapproved = await service.approveBooking(
      rebooked.id,
      ownerId,
      UserRole.USER,
    );
    expect(reapproved.status).toBe(BookingStatus.APPROVED);
  });

  // 10, 11, 12, 13. Handover hai bên -> IN_USE -> RETURN_PENDING -> COMPLETED -> Review (1 lần)
  it('10-13. enforces two-party PICKUP and RETURN handovers, then allows review once after COMPLETED', async () => {
    const booking = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
    });
    await service.approveBooking(booking.id, ownerId, UserRole.USER);

    // Review before COMPLETED must fail
    await expect(
      service.createReview(booking.id, renterId1, {
        rating: 5,
        comment: 'Chưa xong nhưng thử đánh giá',
      }),
    ).rejects.toThrow(BadRequestException);

    // Step 1: Owner confirms pickup handover first -> stays APPROVED
    const afterOwnerPickup = await service.confirmPickupHandover(
      booking.id,
      ownerId,
      UserRole.USER,
      {
        photos: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'],
        condition: GearCondition.LIKE_NEW,
        notes: 'Giao đủ 12 cọc lều',
      },
    );
    expect(afterOwnerPickup.status).toBe(BookingStatus.APPROVED);

    // Owner tries to confirm again on behalf of both -> BadRequestException
    await expect(
      service.confirmPickupHandover(booking.id, ownerId, UserRole.USER, {
        notes: 'Tự xác nhận lần 2',
      }),
    ).rejects.toThrow(BadRequestException);

    // Step 2: Renter confirms pickup handover -> transitions to IN_USE
    const afterRenterPickup = await service.confirmPickupHandover(
      booking.id,
      renterId1,
      UserRole.USER,
      {
        condition: GearCondition.LIKE_NEW,
        notes: 'Đã nhận đủ bộ lều',
      },
    );
    expect(afterRenterPickup.status).toBe(BookingStatus.IN_USE);
    expect(afterRenterPickup.handedOverAt).toBeDefined();

    // Cannot cancel once IN_USE
    await expect(
      service.cancelBooking(booking.id, renterId1, UserRole.USER, {
        reason: 'Thử hủy khi đang dùng',
      }),
    ).rejects.toThrow(BadRequestException);

    // Step 3: Renter initiates return handover -> transitions to RETURN_PENDING
    const afterRenterReturn = await service.confirmReturnHandover(
      booking.id,
      renterId1,
      UserRole.USER,
      {
        photos: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'],
        condition: GearCondition.GOOD,
        notes: 'Đã phơi khô và trả lại',
      },
    );
    expect(afterRenterReturn.status).toBe(BookingStatus.RETURN_PENDING);

    // Step 4: Owner confirms return inspection -> transitions to COMPLETED
    const completed = await service.confirmReturnHandover(
      booking.id,
      ownerId,
      UserRole.USER,
      {
        condition: GearCondition.GOOD,
        notes: 'Đã nhận lại lều nguyên vẹn',
      },
    );
    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.completedAt).toBeDefined();

    // Step 5: Renter submits 5-star review -> succeeds
    const review = await service.createReview(booking.id, renterId1, {
      rating: 5,
      comment: 'Thiết bị tuyệt vời, chủ đồ nhiệt tình!',
    });
    expect(review.rating).toBe(5);

    // Step 6: Renter tries to review a second time -> ConflictException
    await expect(
      service.createReview(booking.id, renterId1, {
        rating: 4,
        comment: 'Đánh giá lần 2',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // 14. Dispute workflow
  it('14. allows opening a dispute on active booking and Admin resolving it', async () => {
    const booking = await service.createBooking(renterId1, {
      gearId,
      startAt: '2026-12-01T00:00:00.000Z',
      endAt: '2026-12-03T00:00:00.000Z',
    });
    await service.approveBooking(booking.id, ownerId, UserRole.USER);

    const dispute = await service.createDispute(
      booking.id,
      ownerId,
      UserRole.USER,
      {
        reason: DisputeReason.LATE_RETURN,
        description: 'Người thuê trả thiết bị trễ 1 ngày so với lịch hẹn',
        evidence: [],
      },
    );
    expect(dispute.status).toBe(DisputeStatus.OPEN);

    const disputedBooking = await service.getBookingById(
      booking.id,
      ownerId,
      UserRole.USER,
    );
    expect(disputedBooking.status).toBe(BookingStatus.DISPUTED);

    const resolved = await service.resolveDispute(
      dispute.id,
      adminId,
      UserRole.ADMIN,
      {
        status: DisputeStatus.RESOLVED_FOR_OWNER,
        adminNotes: 'Hai bên đã thống nhất hỗ trợ phụ phí trả muộn 1 ngày.',
      },
    );
    expect(resolved.status).toBe(DisputeStatus.RESOLVED_FOR_OWNER);
  });
});
