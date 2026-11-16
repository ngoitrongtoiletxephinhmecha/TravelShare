import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
  GearAvailability,
  GearAvailabilityDocument,
  GearItem,
  GearItemDocument,
} from '../../database/schemas';
import {
  CheckAvailabilityQueryDto,
  CreateUnavailablePeriodDto,
} from './dto/gear.dto';
import {
  BookingStatus,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  UserRole,
} from '../../common/enums/system.enums';

/**
 * Unified list of booking statuses that actively hold physical gear inventory.
 * - DISPUTED keeps holding until Admin resolves to COMPLETED or CANCELLED.
 * - COMPLETED, CANCELLED, REJECTED, EXPIRED, and PENDING do NOT hold inventory.
 */
export const HOLDING_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.IN_USE,
  BookingStatus.RETURN_PENDING,
  BookingStatus.DISPUTED,
];

export const TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
];

export interface RentalQuoteSnapshot {
  sharingType: GearListingType;
  pricePerDay: number;
  depositPerUnit: number;
  rentalDays: number;
  quantity: number;
  totalRentalFee: number;
  depositAmount: number;
}

export interface GearAvailabilityEvaluation {
  gearId: string;
  isListingEligible: boolean;
  listingIneligibleReason?: string;
  isDurationValid: boolean;
  durationInvalidReason?: string;
  isAvailable: boolean;
  unavailableReason?: string;
  minRentalDays: number;
  maxRentalDays: number;
  rentalDays: number;
  totalQuantity: number;
  peakReserved: number;
  availableQuantity: number;
  requestedQuantity: number;
  quote: RentalQuoteSnapshot;
  conflictingPeriods: Array<Record<string, any>>;
}

class RetryableReservationConflictError extends Error {
  constructor() {
    super('RETRYABLE_RESERVATION_CONFLICT');
    this.name = 'RetryableReservationConflictError';
  }
}

@Injectable()
export class AvailabilityService {
  private readonly gearLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectModel(GearAvailability.name)
    private availabilityModel: Model<GearAvailabilityDocument>,
    @InjectModel(GearItem.name)
    private gearModel: Model<GearItemDocument>,
    @Optional()
    @InjectModel(Booking.name)
    private bookingModel?: Model<BookingDocument>,
    @Optional()
    @InjectConnection()
    private connection?: Connection,
    @Optional()
    private readonly configService?: ConfigService,
  ) { }

  private isProductionEnvironment(): boolean {
    return Boolean(
      this.configService?.get<boolean>('isProduction') ||
        this.configService?.get<string>('nodeEnv') === 'production' ||
        process.env.NODE_ENV === 'production',
    );
  }

  private attachSession<T>(query: T, session?: ClientSession | null): T {
    if (session && query && typeof (query as any).session === 'function') {
      (query as any).session(session);
    }
    return query;
  }

  private isTransientConflictError(err: any): boolean {
    if (!err) return false;
    if (err instanceof RetryableReservationConflictError) return true;
    if (err?.code === 112 || err?.codeName === 'WriteConflict') return true;
    if (
      typeof err?.hasErrorLabel === 'function' &&
      err.hasErrorLabel('TransientTransactionError')
    ) {
      return true;
    }
    if (
      Array.isArray(err?.errorLabels) &&
      err.errorLabels.includes('TransientTransactionError')
    ) {
      return true;
    }
    const msg = String(err?.message || '');
    return /WriteConflict|TransientTransactionError|Unable to acquire/i.test(
      msg,
    );
  }

  /**
   * Run a critical section serialized per gearId within this Node instance
   */
  async withGearLock<T>(gearId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(gearId);
    const prev = this.gearLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gearLocks.set(
      key,
      prev.then(() => current),
    );

    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.gearLocks.get(key) === current) {
        this.gearLocks.delete(key);
      }
    }
  }

  /**
   * Normalize date/time inputs using Asia/Ho_Chi_Minh (+07:00) for date-only values
   */
  normalizeDateInput(raw: string | Date): { date: Date; isDateOnly: boolean } {
    if (raw instanceof Date) {
      return { date: raw, isDateOnly: false };
    }
    const str = String(raw ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return {
        date: new Date(`${str}T00:00:00.000+07:00`),
        isDateOnly: true,
      };
    }
    return { date: new Date(str), isDateOnly: false };
  }

  getVietnamTodayStart(referenceNow = new Date()): Date {
    const todayIctStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(referenceNow);
    return new Date(`${todayIctStr}T00:00:00.000+07:00`);
  }

  /**
   * Parse and validate interval [startAt, endAt)
   * Blocks past intervals by default (disable only when re-checking an existing historical booking).
   */
  parseAndValidateInterval(
    rawStart: string | Date,
    rawEnd: string | Date,
    options?: { disallowPast?: boolean; referenceNow?: Date },
  ) {
    const startParsed = this.normalizeDateInput(rawStart);
    const endParsed = this.normalizeDateInput(rawEnd);
    const startAt = startParsed.date;
    const endAt = endParsed.date;

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new BadRequestException(
        'Định dạng thời gian bắt đầu hoặc kết thúc không hợp lệ',
      );
    }

    if (startAt >= endAt) {
      throw new BadRequestException(
        'Khoảng ngày không hợp lệ: Thời gian bắt đầu (startAt) phải nhỏ hơn thời gian kết thúc (endAt) theo quy ước [startAt, endAt)',
      );
    }

    if (options?.disallowPast !== false) {
      const now = options?.referenceNow ?? new Date();
      if (startParsed.isDateOnly) {
        const todayStartIct = this.getVietnamTodayStart(now);
        if (startAt.getTime() < todayStartIct.getTime()) {
          throw new BadRequestException(
            'Không thể chọn khoảng ngày bắt đầu trong quá khứ (theo múi giờ Việt Nam)',
          );
        }
      } else if (startAt.getTime() < now.getTime() - 60_000) {
        throw new BadRequestException(
          'Không thể đặt hoặc khóa lịch với thời gian bắt đầu trong quá khứ',
        );
      }
    }

    const diffMs = endAt.getTime() - startAt.getTime();
    const rentalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return { startAt, endAt, rentalDays };
  }

  isGearEligibleForBooking(gear: any): {
    eligible: boolean;
    reason?: string;
  } {
    if (!gear) {
      return { eligible: false, reason: 'Không tìm thấy thiết bị' };
    }
    if (this.isProductionEnvironment() && gear.isDemo) {
      return {
        eligible: false,
        reason: 'Thiết bị dữ liệu demo không được phép sử dụng trong môi trường production',
      };
    }
    if (
      gear.status !== GearStatus.ACTIVE ||
      gear.moderationStatus !== GearModerationStatus.APPROVED ||
      gear.isActive === false
    ) {
      return {
        eligible: false,
        reason:
          'Thiết bị hiện không ở trạng thái hoạt động & đã duyệt để nhận yêu cầu thuê/mượn',
      };
    }
    return { eligible: true };
  }

  validateRentalDurationAndNotice(
    gear: any,
    startAt: Date,
    rentalDays: number,
    options?: { enforceAdvanceNotice?: boolean; referenceNow?: Date },
  ): {
    valid: boolean;
    reason?: string;
    minRentalDays: number;
    maxRentalDays: number;
  } {
    const minRentalDays = Math.max(
      1,
      Number(gear?.availabilitySettings?.minRentalDays ?? 1),
    );
    const maxRentalDays = Math.max(
      minRentalDays,
      Number(gear?.availabilitySettings?.maxRentalDays ?? 14),
    );

    if (rentalDays < minRentalDays || rentalDays > maxRentalDays) {
      return {
        valid: false,
        reason: `Số ngày thuê (${rentalDays} ngày) phải nằm trong khoảng cho phép của chủ đồ: từ ${minRentalDays} đến ${maxRentalDays} ngày`,
        minRentalDays,
        maxRentalDays,
      };
    }

    if (options?.enforceAdvanceNotice) {
      const noticeHours = Math.max(
        0,
        Number(gear?.availabilitySettings?.advanceNoticeHours ?? 0),
      );
      if (noticeHours > 0) {
        const now = options.referenceNow ?? new Date();
        const minAllowedStart = now.getTime() + noticeHours * 60 * 60 * 1000;
        if (startAt.getTime() < minAllowedStart) {
          return {
            valid: false,
            reason: `Chủ thiết bị yêu cầu đặt trước tối thiểu ${noticeHours} giờ`,
            minRentalDays,
            maxRentalDays,
          };
        }
      }
    }

    return { valid: true, minRentalDays, maxRentalDays };
  }

  calculateRentalQuote(
    gear: any,
    rentalDays: number,
    quantity = 1,
  ): RentalQuoteSnapshot {
    const sharingType: GearListingType =
      gear?.sharingType || gear?.listingType || GearListingType.RENT;
    const isFreeLoan = sharingType === GearListingType.FREE_LOAN;
    const pricePerDay = isFreeLoan
      ? 0
      : Math.max(0, Number(gear?.pricePerDay ?? gear?.dailyPriceVnd ?? 0));
    const depositPerUnit = Math.max(
      0,
      Number(gear?.depositAmount ?? gear?.depositAmountVnd ?? 0),
    );
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const days = Math.max(1, Math.floor(Number(rentalDays) || 1));

    return {
      sharingType,
      pricePerDay,
      depositPerUnit,
      rentalDays: days,
      quantity: qty,
      totalRentalFee: isFreeLoan ? 0 : pricePerDay * days * qty,
      depositAmount: depositPerUnit * qty,
    };
  }

  /**
   * Sweep-line peak concurrent occupancy in [reqStart, reqEnd).
   * - Merges OWNER_BLOCKED slots + BOOKED slots + active holding Bookings.
   * - Deduplicates whenever a booking has BOTH a holding Booking doc and a BOOKED slot.
   * - Ignores stale BOOKED slots whose booking is already COMPLETED/CANCELLED/REJECTED/EXPIRED.
   * - Handles adjacent [start, end) boundaries cleanly (morning vs afternoon).
   */
  computePeakOccupancyInInterval(params: {
    reqStart: Date;
    reqEnd: Date;
    availabilityPeriods: any[];
    holdingBookings?: any[];
    bookingStatusesById?: Map<string, BookingStatus>;
    excludeBookingId?: string | Types.ObjectId;
  }): {
    peakReserved: number;
    effectiveIntervals: Array<{
      startAt: Date;
      endAt: Date;
      reservedQuantity: number;
      reason: 'BOOKED' | 'OWNER_BLOCKED';
      bookingId?: string;
      note?: string;
      id?: string;
    }>;
  } {
    const {
      reqStart,
      reqEnd,
      availabilityPeriods,
      holdingBookings = [],
      bookingStatusesById,
      excludeBookingId,
    } = params;
    const excludeIdStr = excludeBookingId ? String(excludeBookingId) : null;

    const effectiveIntervals: Array<{
      startAt: Date;
      endAt: Date;
      reservedQuantity: number;
      reason: 'BOOKED' | 'OWNER_BLOCKED';
      bookingId?: string;
      note?: string;
      id?: string;
    }> = [];

    const activeBookingMap = new Map<string, any>();
    for (const bk of holdingBookings) {
      const idStr = String(bk._id);
      if (excludeIdStr && idStr === excludeIdStr) continue;
      if (!HOLDING_BOOKING_STATUSES.includes(bk.status)) continue;
      const bStart = new Date(bk.startAt || bk.startDate);
      const bEnd = new Date(bk.endAt || bk.endDate);
      if (!(bStart < reqEnd && bEnd > reqStart)) continue;
      activeBookingMap.set(idStr, bk);
    }

    const seenBookingIds = new Set<string>();

    // First walk GearAvailability records (keeping id/note metadata when available)
    for (const p of availabilityPeriods || []) {
      const pStart = new Date(p.startAt || p.startDate);
      const pEnd = new Date(p.endAt || p.endDate);
      if (!(pStart < reqEnd && pEnd > reqStart)) continue;

      if (p.reason === 'OWNER_BLOCKED') {
        effectiveIntervals.push({
          id: p._id ? String(p._id) : p.id ? String(p.id) : undefined,
          startAt: pStart,
          endAt: pEnd,
          reservedQuantity: Math.max(1, Number(p.reservedQuantity) || 1),
          reason: 'OWNER_BLOCKED',
          note: p.note || '',
        });
        continue;
      }

      // BOOKED availability slot
      const bId = p.bookingId ? String(p.bookingId) : undefined;
      if (bId && excludeIdStr && bId === excludeIdStr) {
        continue;
      }

      if (bId && bookingStatusesById?.has(bId)) {
        const knownStatus = bookingStatusesById.get(bId)!;
        if (!HOLDING_BOOKING_STATUSES.includes(knownStatus)) {
          // Stale slot left over from cancelled/completed/expired booking -> skip
          continue;
        }
      }

      if (bId) {
        if (seenBookingIds.has(bId)) {
          // Never double count duplicate BOOKED records for same booking
          continue;
        }
        seenBookingIds.add(bId);
        const linkedBooking = activeBookingMap.get(bId);
        effectiveIntervals.push({
          id: p._id ? String(p._id) : p.id ? String(p.id) : undefined,
          bookingId: bId,
          startAt: linkedBooking
            ? new Date(linkedBooking.startAt || linkedBooking.startDate)
            : pStart,
          endAt: linkedBooking
            ? new Date(linkedBooking.endAt || linkedBooking.endDate)
            : pEnd,
          reservedQuantity: linkedBooking
            ? Math.max(1, Number(linkedBooking.quantity) || 1)
            : Math.max(1, Number(p.reservedQuantity) || 1),
          reason: 'BOOKED',
          note: p.note || '',
        });
      } else {
        effectiveIntervals.push({
          id: p._id ? String(p._id) : p.id ? String(p.id) : undefined,
          startAt: pStart,
          endAt: pEnd,
          reservedQuantity: Math.max(1, Number(p.reservedQuantity) || 1),
          reason: 'BOOKED',
          note: p.note || '',
        });
      }
    }

    // Add any active holding bookings that lacked a GearAvailability BOOKED slot
    for (const [bId, bk] of activeBookingMap.entries()) {
      if (seenBookingIds.has(bId)) continue;
      seenBookingIds.add(bId);
      effectiveIntervals.push({
        id: `booking_${bId}`,
        bookingId: bId,
        startAt: new Date(bk.startAt || bk.startDate),
        endAt: new Date(bk.endAt || bk.endDate),
        reservedQuantity: Math.max(1, Number(bk.quantity) || 1),
        reason: 'BOOKED',
        note: `Giữ lịch cho đơn thuê #${bId.slice(-6)}`,
      });
    }

    // Sweep-line across [reqStart, reqEnd) with [-qty] ordered BEFORE [+qty] at equal timestamp
    const events: Array<{ time: number; delta: number }> = [];
    for (const iv of effectiveIntervals) {
      const clampedStart = Math.max(reqStart.getTime(), iv.startAt.getTime());
      const clampedEnd = Math.min(reqEnd.getTime(), iv.endAt.getTime());
      if (clampedStart >= clampedEnd || iv.reservedQuantity <= 0) continue;
      events.push({ time: clampedStart, delta: iv.reservedQuantity });
      events.push({ time: clampedEnd, delta: -iv.reservedQuantity });
    }

    events.sort((a, b) => a.time - b.time || a.delta - b.delta);

    let running = 0;
    let peakReserved = 0;
    for (const ev of events) {
      running += ev.delta;
      if (running > peakReserved) {
        peakReserved = running;
      }
    }

    return { peakReserved, effectiveIntervals };
  }

  /**
   * Load periods + active holding bookings + status lookup for a gear in [startAt, endAt)
   */
  private async loadGearIntervalSources(
    gearId: string | Types.ObjectId,
    startAt: Date,
    endAt: Date,
    session?: ClientSession | null,
  ): Promise<{
    availabilityPeriods: any[];
    holdingBookings: any[];
    bookingStatusesById: Map<string, BookingStatus>;
  }> {
    const gearObjId = new Types.ObjectId(String(gearId));
    const availQuery = this.availabilityModel.find({
      gearId: gearObjId,
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    });
    this.attachSession(availQuery, session);
    const availabilityPeriods =
      typeof (availQuery as any)?.lean === 'function'
        ? await (availQuery as any).lean()
        : await (availQuery as any).sort({ startAt: 1 }).lean();

    let holdingBookings: any[] = [];
    const bookingStatusesById = new Map<string, BookingStatus>();

    if (this.bookingModel && typeof this.bookingModel.find === 'function') {
      const bkQuery = this.bookingModel.find({
        gearId: gearObjId,
        status: { $in: HOLDING_BOOKING_STATUSES },
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      });
      this.attachSession(bkQuery, session);
      holdingBookings = await bkQuery.lean();
      for (const bk of holdingBookings) {
        bookingStatusesById.set(String(bk._id), bk.status);
      }

      // Check status for any BOOKED availability slot not found in holdingBookings
      const extraIds: string[] = Array.from(
        new Set(
          (availabilityPeriods || [])
            .filter(
              (p: any) =>
                p.reason === 'BOOKED' &&
                p.bookingId &&
                !bookingStatusesById.has(String(p.bookingId)),
            )
            .map((p: any) => String(p.bookingId)),
        ),
      );
      if (extraIds.length > 0) {
        const extraQuery = this.bookingModel.find({
          _id: { $in: extraIds.map((id) => new Types.ObjectId(id)) },
        });
        this.attachSession(extraQuery, session);
        const extraDocs = await extraQuery.lean();
        for (const doc of extraDocs) {
          bookingStatusesById.set(String(doc._id), doc.status);
        }
      }
    }

    return { availabilityPeriods, holdingBookings, bookingStatusesById };
  }

  /**
   * Reconcile drift between Booking & GearAvailability inside an active transaction/lock:
   * - Removes stale BOOKED slots whose booking is COMPLETED/CANCELLED/REJECTED/EXPIRED.
   * - Backfills missing BOOKED slots for active holding bookings.
   */
  async reconcileGearAvailabilityInSession(
    gearId: string | Types.ObjectId,
    session?: ClientSession | null,
  ): Promise<void> {
    if (!this.bookingModel || typeof this.bookingModel.find !== 'function') {
      return;
    }

    const gearObjId = new Types.ObjectId(String(gearId));
    const bookedQuery = this.availabilityModel.find({
      gearId: gearObjId,
      reason: 'BOOKED',
    });
    this.attachSession(bookedQuery, session);
    const bookedSlots = await bookedQuery.lean();

    const holdingQuery = this.bookingModel.find({
      gearId: gearObjId,
      status: { $in: HOLDING_BOOKING_STATUSES },
    });
    this.attachSession(holdingQuery, session);
    const holdingBookings = await holdingQuery.lean();

    const holdingMap = new Map<string, any>(
      holdingBookings.map((b: any) => [String(b._id), b]),
    );

    const slotBookingIds = new Set<string>();
    const nonHoldingSlotIds = bookedSlots
      .filter((s: any) => s.bookingId && !holdingMap.has(String(s.bookingId)))
      .map((s: any) => String(s.bookingId));

    const extraStatuses = new Map<string, BookingStatus>();
    if (nonHoldingSlotIds.length > 0) {
      const extraQuery = this.bookingModel.find({
        _id: { $in: nonHoldingSlotIds.map((id) => new Types.ObjectId(id)) },
      });
      this.attachSession(extraQuery, session);
      const docs = await extraQuery.lean();
      for (const d of docs) {
        extraStatuses.set(String(d._id), d.status);
      }
    }

    for (const slot of bookedSlots) {
      if (!slot.bookingId) continue;
      const bId = String(slot.bookingId);
      if (holdingMap.has(bId)) {
        slotBookingIds.add(bId);
        continue;
      }
      // If booking exists and is terminal/pending, remove stale BOOKED slot
      const status = extraStatuses.get(bId);
      if (status && !HOLDING_BOOKING_STATUSES.includes(status)) {
        if (typeof this.availabilityModel.deleteMany === 'function') {
          const delQ = this.availabilityModel.deleteMany({
            bookingId: new Types.ObjectId(bId),
            reason: 'BOOKED',
          });
          this.attachSession(delQ, session);
          await delQ;
        }
      }
    }

    // Backfill any holding booking that lost its BOOKED slot
    for (const [bId, bk] of holdingMap.entries()) {
      if (slotBookingIds.has(bId)) continue;
      const bStart = new Date(bk.startAt || bk.startDate);
      const bEnd = new Date(bk.endAt || bk.endDate);
      if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) continue;
      await this.recordBookedSlot(
        {
          gearId: gearObjId,
          bookingId: new Types.ObjectId(bId),
          startAt: bStart,
          endAt: bEnd,
          quantity: Math.max(1, Number(bk.quantity) || 1),
          note: `Đồng bộ lịch cho đơn thuê #${bId.slice(-6)}`,
        },
        session,
      );
    }
  }

  /**
   * Shared MongoDB Transaction + Conditional OCC lock on GearItem.reservationVersion
   * with finite retries on transient write conflicts.
   */
  async runGearReservationTransaction<T>(
    gearId: string,
    executor: (ctx: {
      gear: any;
      session: ClientSession | null;
    }) => Promise<{
      result: T;
      gearSet?: Record<string, any>;
      bumpVersion?: boolean;
    }>,
  ): Promise<T> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    return this.withGearLock(gearId, async () => {
      const MAX_RETRIES = 5;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const useSession = Boolean(
          this.connection && typeof this.connection.startSession === 'function',
        );
        const session = useSession
          ? await this.connection!.startSession()
          : null;

        try {
          let txOutput!: T;

          const runCore = async (activeSession: ClientSession | null) => {
            const gearQuery = this.gearModel.findById(gearId);
            this.attachSession(gearQuery, activeSession);
            const gear = await gearQuery.lean();
            if (!gear) {
              throw new NotFoundException('Không tìm thấy thiết bị');
            }

            await this.reconcileGearAvailabilityInSession(
              gear._id as any,
              activeSession,
            );

            const execOut = await executor({
              gear,
              session: activeSession,
            });

            if (execOut.bumpVersion !== false) {
              const currentVersion =
                Number((gear as any).reservationVersion) || 0;
              const updateDoc: Record<string, any> = {
                $inc: { reservationVersion: 1 },
                ...(execOut.gearSet ? { $set: execOut.gearSet } : {}),
              };
              const opts = activeSession
                ? { new: true, session: activeSession }
                : { new: true };

              const lockedGear = await this.gearModel.findOneAndUpdate(
                {
                  _id: gear._id,
                  $or: [
                    { reservationVersion: currentVersion },
                    ...(currentVersion === 0
                      ? [{ reservationVersion: { $exists: false } }]
                      : []),
                  ],
                },
                updateDoc,
                opts,
              );

              if (!lockedGear) {
                throw new RetryableReservationConflictError();
              }
            }

            txOutput = execOut.result;
          };

          if (session) {
            await session.withTransaction(async () => {
              await runCore(session);
            });
          } else {
            await runCore(null);
          }

          return txOutput;
        } catch (err) {
          if (this.isTransientConflictError(err) && attempt < MAX_RETRIES) {
            continue;
          }
          if (err instanceof RetryableReservationConflictError) {
            throw new ConflictException(
              'Xung đột cập nhật đồng thời trên thiết bị, vui lòng thử lại',
            );
          }
          throw err;
        } finally {
          if (session) {
            await session.endSession();
          }
        }
      }

      throw new ConflictException(
        'Không thể hoàn tất thao tác do xung đột đồng thời',
      );
    });
  }

  /**
   * Shared availability + duration + eligibility + quote evaluator
   * used across Marketplace, Gear Detail, Checklist Matching, and Booking.
   */
  async evaluateGearAvailabilityAndQuote(params: {
    gear: any;
    startAt: Date;
    endAt: Date;
    rentalDays: number;
    requestedQuantity?: number;
    excludeBookingId?: string | Types.ObjectId;
    enforceDurationRules?: boolean;
    enforceAdvanceNotice?: boolean;
    referenceNow?: Date;
    session?: ClientSession | null;
  }): Promise<GearAvailabilityEvaluation> {
    const {
      gear,
      startAt,
      endAt,
      rentalDays,
      requestedQuantity = 1,
      excludeBookingId,
      enforceDurationRules = true,
      enforceAdvanceNotice = false,
      referenceNow,
      session,
    } = params;

    const qty = Math.max(1, Math.floor(Number(requestedQuantity) || 1));
    const totalQuantity = Math.max(1, Number(gear?.totalQuantity) || 1);

    const eligibility = this.isGearEligibleForBooking(gear);
    const durationCheck = this.validateRentalDurationAndNotice(
      gear,
      startAt,
      rentalDays,
      { enforceAdvanceNotice, referenceNow },
    );

    const { availabilityPeriods, holdingBookings, bookingStatusesById } =
      await this.loadGearIntervalSources(gear._id, startAt, endAt, session);

    const { peakReserved, effectiveIntervals } =
      this.computePeakOccupancyInInterval({
        reqStart: startAt,
        reqEnd: endAt,
        availabilityPeriods,
        holdingBookings,
        bookingStatusesById,
        excludeBookingId,
      });

    const availableQuantity = Math.max(0, totalQuantity - peakReserved);
    const quote = this.calculateRentalQuote(gear, rentalDays, qty);

    let unavailableReason: string | undefined;
    if (!eligibility.eligible) {
      unavailableReason = eligibility.reason;
    } else if (enforceDurationRules && !durationCheck.valid) {
      unavailableReason = durationCheck.reason;
    } else if (availableQuantity < qty) {
      unavailableReason = `Khoảng thời gian này chỉ còn ${availableQuantity}/${totalQuantity} thiết bị khả dụng`;
    }

    const isAvailable =
      eligibility.eligible &&
      (!enforceDurationRules || durationCheck.valid) &&
      availableQuantity >= qty;

    return {
      gearId: String(gear._id),
      isListingEligible: eligibility.eligible,
      listingIneligibleReason: eligibility.reason,
      isDurationValid: durationCheck.valid,
      durationInvalidReason: durationCheck.reason,
      isAvailable,
      unavailableReason,
      minRentalDays: durationCheck.minRentalDays,
      maxRentalDays: durationCheck.maxRentalDays,
      rentalDays,
      totalQuantity,
      peakReserved,
      availableQuantity,
      requestedQuantity: qty,
      quote,
      conflictingPeriods: effectiveIntervals,
    };
  }

  /**
   * Return peak concurrent reserved count for a single gear inside [startAt, endAt)
   */
  async getPeakReservedQuantityInInterval(
    gearId: string | Types.ObjectId,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string | Types.ObjectId,
    session?: ClientSession | null,
  ): Promise<number> {
    const { availabilityPeriods, holdingBookings, bookingStatusesById } =
      await this.loadGearIntervalSources(gearId, startAt, endAt, session);

    const { peakReserved } = this.computePeakOccupancyInInterval({
      reqStart: startAt,
      reqEnd: endAt,
      availabilityPeriods,
      holdingBookings,
      bookingStatusesById,
      excludeBookingId,
    });

    return peakReserved;
  }

  /**
   * Future peak reserved quantity across all upcoming/active intervals for a gear
   * (used before owner lowers totalQuantity)
   */
  async getMaxFuturePeakReservedQuantity(
    gearId: string | Types.ObjectId,
    now = new Date(),
    session?: ClientSession | null,
  ): Promise<number> {
    const farFuture = new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);
    return this.getPeakReservedQuantityInInterval(
      gearId,
      now,
      farFuture,
      undefined,
      session,
    );
  }

  async getOwnerBlockedQuantityInInterval(
    gearId: string | Types.ObjectId,
    startAt: Date,
    endAt: Date,
    session?: ClientSession | null,
  ): Promise<number> {
    const query = this.availabilityModel.find({
      gearId: new Types.ObjectId(String(gearId)),
      reason: 'OWNER_BLOCKED',
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    });
    this.attachSession(query, session);
    const periods = await query.lean();
    const { peakReserved } = this.computePeakOccupancyInInterval({
      reqStart: startAt,
      reqEnd: endAt,
      availabilityPeriods: periods,
    });
    return peakReserved;
  }

  /**
   * Record a BOOKED availability slot when a booking is approved
   */
  async recordBookedSlot(
    params: {
      gearId: Types.ObjectId;
      bookingId: Types.ObjectId;
      startAt: Date;
      endAt: Date;
      quantity: number;
      note?: string;
    },
    session?: ClientSession | null,
  ): Promise<void> {
    const payload = {
      gearId: params.gearId,
      bookingId: params.bookingId,
      startAt: params.startAt,
      endAt: params.endAt,
      startDate: params.startAt,
      endDate: params.endAt,
      reservedQuantity: params.quantity,
      reason: 'BOOKED' as const,
      note: params.note || 'Đã giữ lịch theo giao dịch thuê được duyệt',
    };
    if (session) {
      await this.availabilityModel.create([payload], { session });
    } else {
      await this.availabilityModel.create(payload);
    }
  }

  /**
   * Release a BOOKED availability slot when a booking is cancelled, expired, rejected, or completed
   */
  async releaseBookedSlot(
    bookingId: string | Types.ObjectId,
    session?: ClientSession | null,
  ): Promise<void> {
    if (typeof this.availabilityModel.deleteMany !== 'function') {
      return;
    }
    const query = this.availabilityModel.deleteMany({
      bookingId: new Types.ObjectId(String(bookingId)),
      reason: 'BOOKED',
    });
    this.attachSession(query, session);
    await query;
  }

  /**
   * Sanitize calendar period items so public/non-owner viewers only see date-selection fields.
   */
  private formatPeriodForViewer(period: any, canViewInternal: boolean) {
    const base = {
      id: period.id ? String(period.id) : String(period._id),
      startAt: period.startAt || period.startDate,
      endAt: period.endAt || period.endDate,
      reservedQuantity: Number(period.reservedQuantity) || 1,
      reason: period.reason,
    };

    if (!canViewInternal) {
      return base;
    }

    return {
      ...base,
      gearId: period.gearId ? String(period.gearId) : undefined,
      bookingId: period.bookingId ? String(period.bookingId) : undefined,
      note: period.note || '',
      createdAt: period.createdAt,
    };
  }

  async addUnavailablePeriod(
    userId: string,
    userRole: string,
    gearId: string,
    dto: CreateUnavailablePeriodDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const { startAt, endAt } = this.parseAndValidateInterval(
      dto.startAt,
      dto.endAt,
    );

    return this.runGearReservationTransaction(
      gearId,
      async ({ gear, session }) => {
        const isOwner = String(gear.ownerId) === String(userId);
        const isAdmin = userRole === UserRole.ADMIN;
        if (!isOwner && !isAdmin) {
          throw new ForbiddenException(
            'Chỉ chủ sở hữu thiết bị hoặc Admin mới được phép khóa lịch khả dụng',
          );
        }

        const totalGearQty = Math.max(1, Number(gear.totalQuantity) || 1);
        const rawQty = Number(dto.reservedQuantity) || 1;
        if (rawQty < 1 || rawQty > totalGearQty) {
          throw new BadRequestException(
            `Số lượng khóa (${rawQty}) phải từ 1 đến tổng số lượng thiết bị (${totalGearQty})`,
          );
        }

        const peakReserved = await this.getPeakReservedQuantityInInterval(
          gear._id,
          startAt,
          endAt,
          undefined,
          session,
        );
        const remaining = Math.max(0, totalGearQty - peakReserved);
        if (rawQty > remaining) {
          throw new ConflictException(
            `Không thể khóa ${rawQty} chiếc trong khoảng này vì đã có ${peakReserved}/${totalGearQty} chiếc đang được giữ hoặc khóa lịch (Còn trống: ${remaining})`,
          );
        }

        const payload = {
          gearId: new Types.ObjectId(gearId),
          startAt,
          endAt,
          startDate: startAt,
          endDate: endAt,
          reservedQuantity: rawQty,
          reason: 'OWNER_BLOCKED' as const,
          note: dto.note?.trim() || 'Chủ thiết bị khóa lịch thủ công',
        };

        const created = session
          ? (await this.availabilityModel.create([payload], { session }))[0]
          : await this.availabilityModel.create(payload);

        const raw = (created.toObject ? created.toObject() : created) as any;
        return {
          result: {
            id: String(raw._id),
            gearId: String(raw.gearId),
            startAt: raw.startAt,
            endAt: raw.endAt,
            reservedQuantity: raw.reservedQuantity,
            reason: raw.reason,
            note: raw.note,
            createdAt: raw.createdAt,
          },
        };
      },
    );
  }

  async removeUnavailablePeriod(
    userId: string,
    userRole: string,
    gearId: string,
    periodId: string,
  ): Promise<Record<string, any>> {
    if (
      !Types.ObjectId.isValid(gearId) ||
      !Types.ObjectId.isValid(periodId)
    ) {
      throw new NotFoundException('Không tìm thấy lịch khóa');
    }

    return this.runGearReservationTransaction(
      gearId,
      async ({ gear, session }) => {
        const isOwner = String(gear.ownerId) === String(userId);
        const isAdmin = userRole === UserRole.ADMIN;
        if (!isOwner && !isAdmin) {
          throw new ForbiddenException(
            'Bạn không có quyền mở khóa lịch của thiết bị này',
          );
        }

        const findQ = this.availabilityModel.findOne({
          _id: new Types.ObjectId(periodId),
          gearId: new Types.ObjectId(gearId),
        });
        this.attachSession(findQ, session);
        const period = await findQ;

        if (!period) {
          throw new NotFoundException('Không tìm thấy khoảng thời gian đã khóa');
        }

        if (period.reason === 'BOOKED') {
          throw new BadRequestException(
            'Không thể xóa trực tiếp lịch đã được giữ chỗ bởi giao dịch thuê (BOOKED)',
          );
        }

        const delQ = this.availabilityModel.deleteOne({ _id: period._id });
        this.attachSession(delQ, session);
        await delQ;

        return {
          result: {
            deleted: true,
            periodId,
          },
        };
      },
    );
  }

  async getGearAvailability(
    gearId: string,
    query?: CheckAvailabilityQueryDto,
    viewerId?: string,
    viewerRole?: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(gearId).lean();
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const canViewInternal =
      viewerRole === UserRole.ADMIN ||
      Boolean(viewerId && String(gear.ownerId) === String(viewerId));

    const gearObjId = new Types.ObjectId(gearId);
    const periodsRaw = await this.availabilityModel
      .find({ gearId: gearObjId })
      .sort({ startAt: 1 })
      .lean();

    let holdingBookings: any[] = [];
    const bookingStatusesById = new Map<string, BookingStatus>();
    if (this.bookingModel && typeof this.bookingModel.find === 'function') {
      holdingBookings = await this.bookingModel
        .find({
          gearId: gearObjId,
          status: { $in: HOLDING_BOOKING_STATUSES },
        })
        .lean();
      for (const bk of holdingBookings) {
        bookingStatusesById.set(String(bk._id), bk.status);
      }
      const extraIds: string[] = Array.from(
        new Set(
          (periodsRaw || [])
            .filter(
              (p: any) =>
                p.reason === 'BOOKED' &&
                p.bookingId &&
                !bookingStatusesById.has(String(p.bookingId)),
            )
            .map((p: any) => String(p.bookingId)),
        ),
      );
      if (extraIds.length > 0) {
        const extraDocs = await this.bookingModel
          .find({ _id: { $in: extraIds.map((id) => new Types.ObjectId(id)) } })
          .lean();
        for (const doc of extraDocs) {
          bookingStatusesById.set(String(doc._id), doc.status);
        }
      }
    }

    const allIntervals = this.computePeakOccupancyInInterval({
      reqStart: new Date(0),
      reqEnd: new Date('2100-01-01T00:00:00.000Z'),
      availabilityPeriods: periodsRaw,
      holdingBookings,
      bookingStatusesById,
    }).effectiveIntervals;

    const sanitizedPeriods = allIntervals.map((p) =>
      this.formatPeriodForViewer(p, canViewInternal),
    );

    const minRentalDays = Math.max(
      1,
      Number(gear.availabilitySettings?.minRentalDays ?? 1),
    );
    const maxRentalDays = Math.max(
      minRentalDays,
      Number(gear.availabilitySettings?.maxRentalDays ?? 14),
    );

    // If startAt and endAt are supplied, evaluate availability on [startAt, endAt)
    if (query?.startAt && query?.endAt) {
      const { startAt, endAt, rentalDays } = this.parseAndValidateInterval(
        query.startAt,
        query.endAt,
      );
      const requestedQuantity = Math.max(Number(query.quantity) || 1, 1);

      const evaluation = await this.evaluateGearAvailabilityAndQuote({
        gear,
        startAt,
        endAt,
        rentalDays,
        requestedQuantity,
        enforceDurationRules: true,
        enforceAdvanceNotice: false,
      });

      const overlappingSanitized = evaluation.conflictingPeriods.map((p) =>
        this.formatPeriodForViewer(p, canViewInternal),
      );

      return {
        gearId: String(gear._id),
        totalQuantity: evaluation.totalQuantity,
        minRentalDays: evaluation.minRentalDays,
        maxRentalDays: evaluation.maxRentalDays,
        requestedInterval: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          rentalDays,
          requestedQuantity,
        },
        isAvailable: evaluation.isAvailable,
        unavailableReason: evaluation.unavailableReason || null,
        availableQuantity: evaluation.availableQuantity,
        estimatedCostVnd: {
          pricePerDay: evaluation.quote.pricePerDay,
          totalRentalFee: evaluation.quote.totalRentalFee,
          depositAmount: evaluation.quote.depositAmount,
        },
        conflictingPeriods: overlappingSanitized,
        periods: sanitizedPeriods,
      };
    }

    const eligibility = this.isGearEligibleForBooking(gear);
    return {
      gearId: String(gear._id),
      totalQuantity: Math.max(1, Number(gear.totalQuantity) || 1),
      minRentalDays,
      maxRentalDays,
      isAvailable: eligibility.eligible,
      unavailableReason: eligibility.reason || null,
      availableQuantity: Math.max(1, Number(gear.totalQuantity) || 1),
      periods: sanitizedPeriods,
    };
  }

  /**
   * Batch peak concurrent reserved quantity per gearId in [startAt, endAt).
   * Used by Marketplace search so morning/afternoon bookings and OWNER_BLOCKED
   * use the exact same sweep-line + deduplication rules.
   */
  async getOverlappingReservedMap(
    startAt: Date,
    endAt: Date,
  ): Promise<Map<string, number>> {
    const overlappingPeriods = await this.availabilityModel
      .find({
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      })
      .select('gearId bookingId reason startAt endAt reservedQuantity')
      .lean();

    let holdingBookings: any[] = [];
    if (this.bookingModel && typeof this.bookingModel.find === 'function') {
      holdingBookings = await this.bookingModel
        .find({
          status: { $in: HOLDING_BOOKING_STATUSES },
          startAt: { $lt: endAt },
          endAt: { $gt: startAt },
        })
        .select('gearId status startAt endAt quantity')
        .lean();
    }

    const periodsByGear = new Map<string, any[]>();
    for (const p of overlappingPeriods) {
      const key = String(p.gearId);
      const list = periodsByGear.get(key) || [];
      list.push(p);
      periodsByGear.set(key, list);
    }

    const bookingsByGear = new Map<string, any[]>();
    const bookingStatusesById = new Map<string, BookingStatus>();
    for (const b of holdingBookings) {
      const key = String(b.gearId);
      const list = bookingsByGear.get(key) || [];
      list.push(b);
      bookingsByGear.set(key, list);
      bookingStatusesById.set(String(b._id), b.status);
    }

    // Lookup extra booking statuses for BOOKED periods not present in holdingBookings
    if (this.bookingModel && typeof this.bookingModel.find === 'function') {
      const extraIds: string[] = Array.from(
        new Set(
          overlappingPeriods
            .filter(
              (p: any) =>
                p.reason === 'BOOKED' &&
                p.bookingId &&
                !bookingStatusesById.has(String(p.bookingId)),
            )
            .map((p: any) => String(p.bookingId)),
        ),
      );
      if (extraIds.length > 0) {
        const docs = await this.bookingModel
          .find({ _id: { $in: extraIds.map((id) => new Types.ObjectId(id)) } })
          .select('status')
          .lean();
        for (const d of docs) {
          bookingStatusesById.set(String(d._id), d.status);
        }
      }
    }

    const allGearKeys = new Set<string>([
      ...periodsByGear.keys(),
      ...bookingsByGear.keys(),
    ]);

    const reservedMap = new Map<string, number>();
    for (const gearKey of allGearKeys) {
      const { peakReserved } = this.computePeakOccupancyInInterval({
        reqStart: startAt,
        reqEnd: endAt,
        availabilityPeriods: periodsByGear.get(gearKey) || [],
        holdingBookings: bookingsByGear.get(gearKey) || [],
        bookingStatusesById,
      });
      if (peakReserved > 0) {
        reservedMap.set(gearKey, peakReserved);
      }
    }

    return reservedMap;
  }
}
