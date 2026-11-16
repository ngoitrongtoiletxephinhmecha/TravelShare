import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  Booking,
  BookingAuditEntry,
  BookingDocument,
  Dispute,
  DisputeDocument,
  GearItem,
  GearItemDocument,
  Handover,
  HandoverConfirmationEntry,
  HandoverDocument,
  Profile,
  ProfileDocument,
  Review,
  ReviewDocument,
} from '../../database/schemas';
import {
  BookingStatus,
  DisputeStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  HandoverType,
  UserRole,
} from '../../common/enums/system.enums';
import {
  AvailabilityService,
  HOLDING_BOOKING_STATUSES,
} from '../gear/availability.service';
import { BookingStateMachine } from './booking-state-machine';
import {
  BookingDomainEventPayload,
  BookingEventsService,
} from './booking-events.service';
import { MediaService } from '../media/media.service';
import {
  ApproveBookingDto,
  CancelBookingDto,
  CreateBookingDto,
  CreateDisputeDto,
  CreateReviewDto,
  ListBookingsQueryDto,
  RejectBookingDto,
  ResolveDisputeDto,
  SubmitHandoverDto,
} from './dto/booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(GearItem.name) private gearModel: Model<GearItemDocument>,
    @InjectModel(Handover.name) private handoverModel: Model<HandoverDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Dispute.name) private disputeModel: Model<DisputeDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    private readonly availabilityService: AvailabilityService,
    private readonly eventsService: BookingEventsService,
    @Optional() private readonly mediaService?: MediaService,
  ) {}

  private attachSession<T>(query: T, session?: ClientSession | null): T {
    if (session && query && typeof (query as any).session === 'function') {
      (query as any).session(session);
    }
    return query;
  }

  /**
   * 4. CREATE BOOKING
   */
  async createBooking(
    renterId: string,
    dto: CreateBookingDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(dto.gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(dto.gearId).lean();
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const eligibility = this.availabilityService.isGearEligibleForBooking(gear);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        eligibility.reason ||
          'Thiết bị hiện không ở trạng thái hoạt động (ACTIVE) để nhận yêu cầu thuê/mượn',
      );
    }

    if (String(gear.ownerId) === String(renterId)) {
      throw new BadRequestException(
        'Bạn không thể tự gửi yêu cầu thuê/mượn thiết bị của chính mình',
      );
    }

    const { startAt, endAt, rentalDays } =
      this.availabilityService.parseAndValidateInterval(dto.startAt, dto.endAt);

    const quantity = Math.max(1, Number(dto.quantity) || 1);
    const totalGearQty = gear.totalQuantity || 1;
    if (quantity > totalGearQty) {
      throw new BadRequestException(
        `Số lượng yêu cầu (${quantity}) vượt quá tổng số lượng thiết bị hiện có (${totalGearQty})`,
      );
    }

    const evaluation =
      await this.availabilityService.evaluateGearAvailabilityAndQuote({
        gear,
        startAt,
        endAt,
        rentalDays,
        requestedQuantity: quantity,
        enforceDurationRules: true,
        enforceAdvanceNotice: true,
      });

    if (!evaluation.isDurationValid) {
      throw new BadRequestException(evaluation.durationInvalidReason);
    }

    // Detect stale pricing/listing changes compared to matching snapshot
    if (
      (dto.expectedPricePerDay !== undefined &&
        Number(dto.expectedPricePerDay) !== evaluation.quote.pricePerDay) ||
      (dto.expectedDepositAmount !== undefined &&
        Number(dto.expectedDepositAmount) !== evaluation.quote.depositPerUnit) ||
      (dto.expectedSharingType !== undefined &&
        dto.expectedSharingType !== evaluation.quote.sharingType)
    ) {
      throw new ConflictException({
        code: 'MATCH_DATA_STALE',
        message:
          'Thông tin giá thuê, tiền cọc hoặc hình thức chia sẻ của thiết bị đã thay đổi sau khi tìm kiếm. Vui lòng kiểm tra báo giá mới hoặc tìm lại thiết bị phù hợp.',
      });
    }

    if (evaluation.availableQuantity < quantity) {
      throw new ConflictException({
        code: 'AVAILABILITY_CHANGED',
        message: `Khoảng thời gian [${startAt.toISOString()} → ${endAt.toISOString()}) không còn đủ số lượng thiết bị trống (Còn trống: ${evaluation.availableQuantity}/${totalGearQty}). Vui lòng chọn lịch khác hoặc tìm lại thiết bị.`,
      });
    }

    // Server-side price snapshot (never trust client totals; existing bookings preserve this snapshot)
    const priceSnapshot = evaluation.quote.pricePerDay;
    const rentalTotal = evaluation.quote.totalRentalFee;
    const depositAmount = evaluation.quote.depositAmount;

    const now = new Date();
    const expiresAt = new Date(
      Math.min(
        now.getTime() + 48 * 60 * 60 * 1000,
        Math.max(startAt.getTime(), now.getTime() + 2 * 60 * 60 * 1000),
      ),
    );

    const initialAudit: BookingAuditEntry = {
      fromStatus: null,
      toStatus: BookingStatus.PENDING,
      actorId: String(renterId),
      actorRole: 'RENTER',
      note: dto.renterNote?.trim() || 'Tạo yêu cầu thuê/mượn thiết bị',
      timestamp: now,
    };

    const created = await this.bookingModel.create({
      gearId: new Types.ObjectId(String(gear._id)),
      renterId: new Types.ObjectId(String(renterId)),
      ownerId: new Types.ObjectId(String(gear.ownerId)),
      quantity,
      startAt,
      endAt,
      startDate: startAt,
      endDate: endAt,
      rentalDays,
      totalDays: rentalDays,
      sharingType: gear.sharingType || GearListingType.RENT,
      status: BookingStatus.PENDING,
      priceSnapshot,
      unitDailyPriceSnapshotVnd: priceSnapshot,
      rentalTotal,
      totalRentalFeeSnapshotVnd: rentalTotal,
      depositAmount,
      depositSnapshotVnd: depositAmount,
      pickupLocationSnapshot: {
        city: gear.city,
        district: gear.district,
        coordinates: gear.pickupLocation?.coordinates || [106.7009, 10.7769],
        gearTitle: gear.title,
        brand: gear.brand || '',
        condition: gear.condition,
        usageRules: gear.usageRules || [],
        images: gear.images || [],
      },
      renterNote: dto.renterNote?.trim(),
      expiresAt,
      statusHistory: [initialAudit],
    });

    await this.eventsService.recordAndDispatch({
      event: 'booking.requested',
      bookingId: String(created._id),
      gearId: String(gear._id),
      renterId: String(renterId),
      ownerId: String(gear.ownerId),
      actorId: String(renterId),
      occurredAt: now.toISOString(),
      metadata: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        quantity,
        rentalTotal,
      },
    });

    return this.getBookingById(String(created._id), renterId, UserRole.USER);
  }

  /**
   * 5. APPROVE BOOKING WITH DOUBLE-BOOKING PREVENTION (OCC + Lock + Finite Retry)
   */
  async approveBooking(
    bookingId: string,
    userId: string,
    userRole: string,
    dto?: ApproveBookingDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const initialBooking = await this.bookingModel.findById(bookingId).lean();
    if (!initialBooking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      initialBooking,
    );
    BookingStateMachine.assertValidTransition(
      initialBooking.status,
      BookingStatus.APPROVED,
      actorRole,
    );

    const gearIdStr = String(initialBooking.gearId);

    const txOutcome =
      await this.availabilityService.runGearReservationTransaction<{
        expired?: boolean;
        bookingId?: string;
        renterId?: string;
        ownerId?: string;
        approvedAtIso?: string;
        outboxPayload?: BookingDomainEventPayload;
      }>(gearIdStr, async ({ gear, session }) => {
        const bkQ = this.bookingModel.findById(bookingId);
        this.attachSession(bkQ, session);
        const booking = await bkQ.lean();
        if (!booking) {
          throw new NotFoundException('Không tìm thấy giao dịch');
        }

        BookingStateMachine.assertValidTransition(
          booking.status,
          BookingStatus.APPROVED,
          actorRole,
        );

        const now = new Date();
        const startAt = new Date(booking.startAt || booking.startDate);
        const endAt = new Date(booking.endAt || booking.endDate);

        // Check expiration directly inside approval transaction flow
        if (
          (booking.expiresAt && new Date(booking.expiresAt) <= now) ||
          endAt <= now
        ) {
          const expireAudit: BookingAuditEntry = {
            fromStatus: BookingStatus.PENDING,
            toStatus: BookingStatus.EXPIRED,
            actorId: 'SYSTEM',
            actorRole: 'SYSTEM',
            note: 'Yêu cầu thuê đã hết hạn xử lý khi chủ thiết bị duyệt',
            timestamp: now,
          };
          const expireOpts = session
            ? { new: true, session }
            : { new: true };
          await this.bookingModel
            .findOneAndUpdate(
              { _id: booking._id, status: BookingStatus.PENDING },
              {
                $set: { status: BookingStatus.EXPIRED },
                $push: { statusHistory: expireAudit },
              },
              expireOpts,
            )
            .lean();

          return {
            result: { expired: true },
            bumpVersion: true,
          };
        }

        const eligibility =
          this.availabilityService.isGearEligibleForBooking(gear);
        if (!eligibility.eligible) {
          throw new BadRequestException(
            eligibility.reason ||
              'Thiết bị không còn ở trạng thái hoạt động (ACTIVE & APPROVED) để duyệt giao dịch',
          );
        }

        const requestedQty = Number(booking.quantity) || 1;
        const { rentalDays } =
          this.availabilityService.parseAndValidateInterval(startAt, endAt, {
            disallowPast: false,
          });

        const evaluation =
          await this.availabilityService.evaluateGearAvailabilityAndQuote({
            gear,
            startAt,
            endAt,
            rentalDays,
            requestedQuantity: requestedQty,
            excludeBookingId: booking._id as any,
            enforceDurationRules: false,
            enforceAdvanceNotice: false,
            session,
          });

        if (evaluation.availableQuantity < requestedQty) {
          throw new ConflictException(
            'Không thể duyệt yêu cầu: Khoảng ngày này đã được duyệt/khóa cho người thuê khác hoặc vượt quá số lượng thiết bị khả dụng',
          );
        }

        const auditEntry: BookingAuditEntry = {
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.APPROVED,
          actorId: String(userId),
          actorRole,
          note: dto?.note?.trim() || 'Chủ thiết bị đã chấp nhận yêu cầu thuê',
          timestamp: now,
        };

        // Conditional atomic transition on Booking: PENDING -> APPROVED inside transaction
        const updOpts = session ? { new: true, session } : { new: true };
        const updatedBooking = await this.bookingModel
          .findOneAndUpdate(
            {
              _id: booking._id,
              status: BookingStatus.PENDING,
            },
            {
              $set: {
                status: BookingStatus.APPROVED,
                approvedAt: now,
                ...(dto?.note ? { ownerResponseNote: dto.note.trim() } : {}),
                ...(dto?.internalNote
                  ? { ownerInternalNote: dto.internalNote.trim() }
                  : {}),
              },
              $push: { statusHistory: auditEntry },
            },
            updOpts,
          )
          .lean();

        if (!updatedBooking) {
          throw new ConflictException(
            'Trạng thái giao dịch đã thay đổi bởi một thao tác khác',
          );
        }

        // Write BOOKED slot in same MongoDB transaction; if no session (mock unit test), compensate cleanly on error
        try {
          await this.availabilityService.recordBookedSlot(
            {
              gearId: new Types.ObjectId(String(gear._id)),
              bookingId: new Types.ObjectId(String(booking._id)),
              startAt,
              endAt,
              quantity: requestedQty,
              note: `Giữ lịch cho đơn thuê #${String(booking._id).slice(-6)}`,
            },
            session,
          );
        } catch (slotErr) {
          if (!session) {
            await this.bookingModel
              .findOneAndUpdate(
                { _id: booking._id, status: BookingStatus.APPROVED },
                { $set: { status: BookingStatus.PENDING, approvedAt: null } },
              )
              .lean();
          }
          throw slotErr;
        }

        const outboxPayload = await this.eventsService.recordOutbox(
          {
            event: 'booking.approved',
            bookingId: String(booking._id),
            gearId: gearIdStr,
            renterId: String(booking.renterId),
            ownerId: String(booking.ownerId),
            actorId: String(userId),
            occurredAt: now.toISOString(),
          },
          session,
        );

        return {
          result: {
            bookingId: String(booking._id),
            renterId: String(booking.renterId),
            ownerId: String(booking.ownerId),
            approvedAtIso: now.toISOString(),
            outboxPayload,
          },
          bumpVersion: true,
        };
      });

    if (txOutcome.expired) {
      throw new BadRequestException(
        'Yêu cầu thuê đã hết hạn chờ duyệt (EXPIRED), không thể chấp nhận giao dịch này',
      );
    }

    this.eventsService.emit(
      txOutcome.outboxPayload || {
        event: 'booking.approved',
        bookingId: txOutcome.bookingId!,
        gearId: gearIdStr,
        renterId: txOutcome.renterId!,
        ownerId: txOutcome.ownerId!,
        actorId: String(userId),
        occurredAt: txOutcome.approvedAtIso!,
      },
    );

    return this.getBookingById(txOutcome.bookingId!, userId, userRole);
  }

  /**
   * REJECT BOOKING (Owner only, PENDING -> REJECTED)
   */
  async rejectBooking(
    bookingId: string,
    userId: string,
    userRole: string,
    dto?: RejectBookingDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      booking,
    );
    BookingStateMachine.assertValidTransition(
      booking.status,
      BookingStatus.REJECTED,
      actorRole,
    );

    const now = new Date();
    const auditEntry: BookingAuditEntry = {
      fromStatus: booking.status,
      toStatus: BookingStatus.REJECTED,
      actorId: String(userId),
      actorRole,
      note: dto?.reason?.trim() || 'Chủ thiết bị từ chối yêu cầu thuê',
      timestamp: now,
    };

    const updated = await this.bookingModel
      .findOneAndUpdate(
        { _id: booking._id, status: booking.status },
        {
          $set: {
            status: BookingStatus.REJECTED,
            rejectedAt: now,
            ownerResponseNote:
              dto?.reason?.trim() || 'Chủ thiết bị từ chối yêu cầu',
          },
          $push: { statusHistory: auditEntry },
        },
        { new: true },
      )
      .lean();

    if (!updated) {
      throw new ConflictException('Trạng thái giao dịch đã thay đổi');
    }

    await this.eventsService.recordAndDispatch({
      event: 'booking.rejected',
      bookingId: String(booking._id),
      gearId: String(booking.gearId),
      renterId: String(booking.renterId),
      ownerId: String(booking.ownerId),
      actorId: String(userId),
      occurredAt: now.toISOString(),
    });

    return this.getBookingById(String(booking._id), userId, userRole);
  }

  /**
   * 9. CANCEL BOOKING (Allowed in PENDING or APPROVED; releases booked schedule)
   */
  async cancelBooking(
    bookingId: string,
    userId: string,
    userRole: string,
    dto: CancelBookingDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      booking,
    );
    BookingStateMachine.assertValidTransition(
      booking.status,
      BookingStatus.CANCELLED,
      actorRole,
    );

    const now = new Date();
    const auditEntry: BookingAuditEntry = {
      fromStatus: booking.status,
      toStatus: BookingStatus.CANCELLED,
      actorId: String(userId),
      actorRole,
      note: dto.reason.trim(),
      timestamp: now,
    };

    const cancelOutboxPayload =
      await this.availabilityService.runGearReservationTransaction<BookingDomainEventPayload>(
        String(booking.gearId),
        async ({ session }) => {
          const currentBkQ = this.bookingModel.findById(booking._id);
          this.attachSession(currentBkQ, session);
          const latestBk = await currentBkQ.lean();
          if (!latestBk) {
            throw new NotFoundException('Không tìm thấy giao dịch');
          }
          BookingStateMachine.assertValidTransition(
            latestBk.status,
            BookingStatus.CANCELLED,
            actorRole,
          );

          const opts = session ? { new: true, session } : { new: true };
          const updated = await this.bookingModel
            .findOneAndUpdate(
              { _id: latestBk._id, status: latestBk.status },
              {
                $set: {
                  status: BookingStatus.CANCELLED,
                  cancellationReason: dto.reason.trim(),
                  cancelledBy: new Types.ObjectId(String(userId)),
                },
                $push: { statusHistory: auditEntry },
              },
              opts,
            )
            .lean();

          if (!updated) {
            throw new ConflictException('Trạng thái giao dịch đã thay đổi');
          }

          await this.availabilityService.releaseBookedSlot(
            latestBk._id,
            session,
          );

          const outboxPayload = await this.eventsService.recordOutbox(
            {
              event: 'booking.cancelled',
              bookingId: String(booking._id),
              gearId: String(booking.gearId),
              renterId: String(booking.renterId),
              ownerId: String(booking.ownerId),
              actorId: String(userId),
              occurredAt: now.toISOString(),
              metadata: { reason: dto.reason.trim() },
            },
            session,
          );

          return { result: outboxPayload, bumpVersion: true };
        },
      );

    this.eventsService.emit(cancelOutboxPayload);

    return this.getBookingById(String(booking._id), userId, userRole);
  }

  /**
   * Expire overdue PENDING bookings idempotently (avoids duplicate status transitions)
   */
  async expireOverdueBookings(): Promise<{ expiredCount: number }> {
    const now = new Date();
    const overdueList = await this.bookingModel
      .find({
        status: BookingStatus.PENDING,
        expiresAt: { $lte: now },
      })
      .select('_id status')
      .lean();

    let expiredCount = 0;
    for (const item of overdueList) {
      const auditEntry: BookingAuditEntry = {
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.EXPIRED,
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        note: 'Tự động hết hạn do quá thời gian chờ phản hồi',
        timestamp: now,
      };
      const res = await this.bookingModel.findOneAndUpdate(
        { _id: item._id, status: BookingStatus.PENDING },
        {
          $set: { status: BookingStatus.EXPIRED },
          $push: { statusHistory: auditEntry },
        },
      );
      if (res) {
        await this.availabilityService.releaseBookedSlot(item._id);
        expiredCount += 1;
      }
    }

    return { expiredCount };
  }

  /**
   * 8. HANDOVER SYSTEM: PICKUP (Two-party confirmation -> IN_USE)
   */
  async confirmPickupHandover(
    bookingId: string,
    userId: string,
    userRole: string,
    dto: SubmitHandoverDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      booking,
    );
    if (actorRole !== 'OWNER' && actorRole !== 'RENTER') {
      throw new ForbiddenException(
        'Chỉ Chủ thiết bị và Người thuê mới được xác nhận bàn giao thiết bị',
      );
    }

    if (booking.status !== BookingStatus.APPROVED) {
      throw new BadRequestException(
        `Chỉ có thể xác nhận bàn giao nhận đồ khi giao dịch đang ở trạng thái APPROVED (Hiện tại: ${booking.status})`,
      );
    }

    const existingHandover = await this.handoverModel
      .findOne({
        bookingId: booking._id,
        handoverType: HandoverType.PICKUP,
      })
      .lean();

    const confirmations: HandoverConfirmationEntry[] = [
      ...(existingHandover?.confirmations || []),
    ];

    if (confirmations.some((c) => String(c.userId) === String(userId))) {
      throw new BadRequestException(
        'Bạn đã xác nhận bàn giao nhận thiết bị rồi. Cần bên còn lại xác nhận để chuyển sang trạng thái Đang sử dụng (IN_USE).',
      );
    }

    const validatedPhotos = this.mediaService
      ? await this.mediaService.validateAndNormalizeBookingEvidenceUrls({
          bookingId: String(booking._id),
          actorId: String(userId),
          actorRole: userRole,
          urls: dto.photos,
          scope: 'BOOKING_HANDOVER',
        })
      : dto.photos || [];

    const now = new Date();
    const newEntry: HandoverConfirmationEntry = {
      userId: String(userId),
      role: actorRole,
      confirmedAt: now,
      note: dto.notes?.trim() || '',
      photos: validatedPhotos,
      condition: dto.condition || GearCondition.GOOD,
    };
    confirmations.push(newEntry);

    const mergedPhotos = Array.from(
      new Set([...(existingHandover?.photos || []), ...validatedPhotos]),
    );
    const mergedConfirmedBy = confirmations.map(
      (c) => new Types.ObjectId(String(c.userId)),
    );

    await this.handoverModel.findOneAndUpdate(
      {
        bookingId: booking._id,
        handoverType: HandoverType.PICKUP,
      },
      {
        $set: {
          photos: mergedPhotos,
          condition:
            dto.condition || existingHandover?.condition || GearCondition.GOOD,
          notes: dto.notes?.trim() || existingHandover?.notes || '',
          confirmedBy: mergedConfirmedBy,
          confirmations,
        },
      },
      { upsert: true, new: true },
    );

    const hasOwnerConfirmed = confirmations.some((c) => c.role === 'OWNER');
    const hasRenterConfirmed = confirmations.some((c) => c.role === 'RENTER');

    // Only transition APPROVED -> IN_USE when BOTH Owner and Renter have confirmed
    if (hasOwnerConfirmed && hasRenterConfirmed) {
      BookingStateMachine.assertValidTransition(
        booking.status,
        BookingStatus.IN_USE,
        actorRole,
      );

      const auditEntry: BookingAuditEntry = {
        fromStatus: BookingStatus.APPROVED,
        toStatus: BookingStatus.IN_USE,
        actorId: String(userId),
        actorRole,
        note: 'Cả hai bên đã xác nhận bàn giao thiết bị thành công',
        timestamp: now,
      };

      await this.bookingModel.findOneAndUpdate(
        { _id: booking._id, status: BookingStatus.APPROVED },
        {
          $set: {
            status: BookingStatus.IN_USE,
            handedOverAt: now,
          },
          $push: { statusHistory: auditEntry },
        },
      );

      await this.eventsService.recordAndDispatch({
        event: 'booking.handed_over',
        bookingId: String(booking._id),
        gearId: String(booking.gearId),
        renterId: String(booking.renterId),
        ownerId: String(booking.ownerId),
        actorId: String(userId),
        occurredAt: now.toISOString(),
        metadata: { stage: 'CONFIRMED' },
      });
    } else {
      await this.eventsService.recordAndDispatch({
        event: 'booking.handed_over',
        bookingId: String(booking._id),
        gearId: String(booking.gearId),
        renterId: String(booking.renterId),
        ownerId: String(booking.ownerId),
        actorId: String(userId),
        occurredAt: now.toISOString(),
        metadata: { stage: 'PENDING_PARTNER' },
      });
    }

    return this.getBookingById(String(booking._id), userId, userRole);
  }

  /**
   * 8. HANDOVER SYSTEM: RETURN (First confirmation -> RETURN_PENDING; Second party confirmation -> COMPLETED)
   */
  async confirmReturnHandover(
    bookingId: string,
    userId: string,
    userRole: string,
    dto: SubmitHandoverDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      booking,
    );
    if (actorRole !== 'OWNER' && actorRole !== 'RENTER') {
      throw new ForbiddenException(
        'Chỉ Chủ thiết bị và Người thuê mới được xác nhận hoàn trả thiết bị',
      );
    }

    if (
      booking.status !== BookingStatus.IN_USE &&
      booking.status !== BookingStatus.RETURN_PENDING
    ) {
      throw new BadRequestException(
        `Chỉ có thể xác nhận hoàn trả khi giao dịch đang ở trạng thái IN_USE hoặc RETURN_PENDING (Hiện tại: ${booking.status})`,
      );
    }

    const existingHandover = await this.handoverModel
      .findOne({
        bookingId: booking._id,
        handoverType: HandoverType.RETURN,
      })
      .lean();

    const confirmations: HandoverConfirmationEntry[] = [
      ...(existingHandover?.confirmations || []),
    ];

    if (confirmations.some((c) => String(c.userId) === String(userId))) {
      throw new BadRequestException(
        'Bạn đã gửi xác nhận hoàn trả thiết bị rồi. Cần bên còn lại xác nhận để hoàn tất giao dịch (COMPLETED).',
      );
    }

    const validatedPhotos = this.mediaService
      ? await this.mediaService.validateAndNormalizeBookingEvidenceUrls({
          bookingId: String(booking._id),
          actorId: String(userId),
          actorRole: userRole,
          urls: dto.photos,
          scope: 'BOOKING_HANDOVER',
        })
      : dto.photos || [];

    const now = new Date();
    const newEntry: HandoverConfirmationEntry = {
      userId: String(userId),
      role: actorRole,
      confirmedAt: now,
      note: dto.notes?.trim() || '',
      photos: validatedPhotos,
      condition: dto.condition || GearCondition.GOOD,
    };
    confirmations.push(newEntry);

    const mergedPhotos = Array.from(
      new Set([...(existingHandover?.photos || []), ...validatedPhotos]),
    );
    const mergedConfirmedBy = confirmations.map(
      (c) => new Types.ObjectId(String(c.userId)),
    );

    await this.handoverModel.findOneAndUpdate(
      {
        bookingId: booking._id,
        handoverType: HandoverType.RETURN,
      },
      {
        $set: {
          photos: mergedPhotos,
          condition:
            dto.condition || existingHandover?.condition || GearCondition.GOOD,
          notes: dto.notes?.trim() || existingHandover?.notes || '',
          confirmedBy: mergedConfirmedBy,
          confirmations,
        },
      },
      { upsert: true, new: true },
    );

    const hasOwnerConfirmed = confirmations.some((c) => c.role === 'OWNER');
    const hasRenterConfirmed = confirmations.some((c) => c.role === 'RENTER');

    if (hasOwnerConfirmed && hasRenterConfirmed) {
      const completedOutboxPayload =
        await this.availabilityService.runGearReservationTransaction<BookingDomainEventPayload>(
          String(booking.gearId),
          async ({ session }) => {
            const bkQ = this.bookingModel.findById(booking._id);
            this.attachSession(bkQ, session);
            const latestBk = await bkQ.lean();
            if (!latestBk) {
              throw new NotFoundException('Không tìm thấy giao dịch');
            }
            BookingStateMachine.assertValidTransition(
              latestBk.status,
              BookingStatus.COMPLETED,
              actorRole,
            );

            const auditEntry: BookingAuditEntry = {
              fromStatus: latestBk.status,
              toStatus: BookingStatus.COMPLETED,
              actorId: String(userId),
              actorRole,
              note: 'Cả hai bên đã xác nhận hoàn trả và kiểm tra thiết bị hoàn tất',
              timestamp: now,
            };

            const opts = session ? { new: true, session } : { new: true };
            const updated = await this.bookingModel.findOneAndUpdate(
              { _id: latestBk._id, status: latestBk.status },
              {
                $set: {
                  status: BookingStatus.COMPLETED,
                  returnedAt: latestBk.returnedAt || now,
                  completedAt: now,
                },
                $push: { statusHistory: auditEntry },
              },
              opts,
            );
            if (!updated) {
              throw new ConflictException('Trạng thái giao dịch đã thay đổi');
            }

            await this.availabilityService.releaseBookedSlot(
              latestBk._id,
              session,
            );

            const outboxPayload = await this.eventsService.recordOutbox(
              {
                event: 'booking.completed',
                bookingId: String(booking._id),
                gearId: String(booking.gearId),
                renterId: String(booking.renterId),
                ownerId: String(booking.ownerId),
                actorId: String(userId),
                occurredAt: now.toISOString(),
              },
              session,
            );
            return { result: outboxPayload, bumpVersion: true };
          },
        );

      await Promise.all([
        this.profileModel.updateOne(
          { userId: booking.ownerId },
          { $inc: { completedBookingsCount: 1 } },
        ),
        this.profileModel.updateOne(
          { userId: booking.renterId },
          { $inc: { completedBookingsCount: 1 } },
        ),
      ]);

      this.eventsService.emit(completedOutboxPayload);
    } else if (booking.status === BookingStatus.IN_USE) {
      BookingStateMachine.assertValidTransition(
        booking.status,
        BookingStatus.RETURN_PENDING,
        actorRole,
      );

      const auditEntry: BookingAuditEntry = {
        fromStatus: BookingStatus.IN_USE,
        toStatus: BookingStatus.RETURN_PENDING,
        actorId: String(userId),
        actorRole,
        note: 'Đã tạo yêu cầu hoàn trả thiết bị, chờ bên còn lại xác nhận',
        timestamp: now,
      };

      await this.bookingModel.findOneAndUpdate(
        { _id: booking._id, status: BookingStatus.IN_USE },
        {
          $set: {
            status: BookingStatus.RETURN_PENDING,
            returnedAt: now,
          },
          $push: { statusHistory: auditEntry },
        },
      );

      await this.eventsService.recordAndDispatch({
        event: 'booking.returned',
        bookingId: String(booking._id),
        gearId: String(booking.gearId),
        renterId: String(booking.renterId),
        ownerId: String(booking.ownerId),
        actorId: String(userId),
        occurredAt: now.toISOString(),
      });
    }

    return this.getBookingById(String(booking._id), userId, userRole);
  }

  /**
   * Get handovers for a booking
   */
  async getBookingHandovers(
    bookingId: string,
    userId: string,
    userRole: string,
  ): Promise<Record<string, any>[]> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    BookingStateMachine.resolveActorRole(userId, userRole, booking);

    const handovers = await this.handoverModel
      .find({ bookingId: booking._id })
      .sort({ createdAt: 1 })
      .lean();

    return handovers.map((h: any) => ({
      id: String(h._id),
      bookingId: String(h.bookingId),
      handoverType: h.handoverType,
      photos: h.photos || [],
      condition: h.condition,
      notes: h.notes || '',
      confirmedBy: (h.confirmedBy || []).map((id: any) => String(id)),
      confirmations: h.confirmations || [],
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    }));
  }

  /**
   * 10. REVIEW & TRUST SYSTEM
   */
  async createReview(
    bookingId: string,
    userId: string,
    dto: CreateReviewDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const isRenter = String(booking.renterId) === String(userId);
    const isOwner = String(booking.ownerId) === String(userId);

    if (!isRenter && !isOwner) {
      throw new ForbiddenException(
        'Chỉ những người trực tiếp tham gia giao dịch (Chủ đồ hoặc Người thuê) mới được đánh giá',
      );
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException(
        'Chỉ được phép đánh giá sau khi giao dịch đã hoàn thành (COMPLETED)',
      );
    }

    const existing = await this.reviewModel
      .findOne({
        bookingId: booking._id,
        reviewerId: new Types.ObjectId(String(userId)),
      })
      .lean();

    if (existing) {
      throw new ConflictException(
        'Bạn đã gửi đánh giá cho giao dịch này rồi (mỗi bên chỉ được đánh giá 1 lần)',
      );
    }

    const targetUserId = isRenter ? booking.ownerId : booking.renterId;
    const reviewerRole = isRenter ? 'RENTER' : 'OWNER';

    let createdReview: any;
    try {
      createdReview = await this.reviewModel.create({
        bookingId: booking._id,
        gearId: booking.gearId,
        reviewerId: new Types.ObjectId(String(userId)),
        targetUserId: new Types.ObjectId(String(targetUserId)),
        reviewerRole,
        rating: dto.rating,
        comment: dto.comment.trim(),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          'Bạn đã gửi đánh giá cho giao dịch này rồi',
        );
      }
      throw err;
    }

    // Update target user's trustScore (average rating)
    const targetReviews = await this.reviewModel
      .find({ targetUserId: new Types.ObjectId(String(targetUserId)) })
      .select('rating')
      .lean();

    if (targetReviews.length > 0) {
      const avgTrust =
        Math.round(
          (targetReviews.reduce((s, r: any) => s + Number(r.rating), 0) /
            targetReviews.length) *
            10,
        ) / 10;
      await this.profileModel.updateOne(
        { userId: new Types.ObjectId(String(targetUserId)) },
        { $set: { trustScore: avgTrust } },
      );
    }

    // If renter reviewed owner/gear, also update GearItem ratingAvg & ratingCount
    if (isRenter) {
      const gearReviews = await this.reviewModel
        .find({ gearId: booking.gearId, reviewerRole: 'RENTER' })
        .select('rating')
        .lean();

      if (gearReviews.length > 0) {
        const gearAvg =
          Math.round(
            (gearReviews.reduce((s, r: any) => s + Number(r.rating), 0) /
              gearReviews.length) *
              10,
          ) / 10;
        await this.gearModel.updateOne(
          { _id: booking.gearId },
          {
            $set: {
              ratingAvg: gearAvg,
              ratingCount: gearReviews.length,
            },
          },
        );
      }
    }

    const raw = createdReview.toObject();
    return {
      id: String(raw._id),
      bookingId: String(raw.bookingId),
      gearId: String(raw.gearId),
      reviewerId: String(raw.reviewerId),
      targetUserId: String(raw.targetUserId),
      reviewerRole: raw.reviewerRole,
      rating: raw.rating,
      comment: raw.comment,
      createdAt: raw.createdAt,
    };
  }

  /**
   * Get reviews received by a user (for Profile page)
   */
  async getUserReviews(targetIdentifier: string): Promise<Record<string, any>> {
    let targetUserId: Types.ObjectId | null = null;
    if (Types.ObjectId.isValid(targetIdentifier)) {
      targetUserId = new Types.ObjectId(targetIdentifier);
    } else {
      const prof = await this.profileModel
        .findOne({ username: targetIdentifier.toLowerCase() })
        .lean();
      if (prof) {
        targetUserId = prof.userId;
      }
    }

    if (!targetUserId) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const reviews = await this.reviewModel
      .find({ targetUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const reviewerIds = Array.from(
      new Set(reviews.map((r: any) => String(r.reviewerId))),
    ).map((id) => new Types.ObjectId(id));

    const gearIds = Array.from(
      new Set(reviews.map((r: any) => String(r.gearId))),
    ).map((id) => new Types.ObjectId(id));

    const [profiles, gears] = await Promise.all([
      reviewerIds.length > 0
        ? this.profileModel.find({ userId: { $in: reviewerIds } }).lean()
        : Promise.resolve([]),
      gearIds.length > 0
        ? this.gearModel
            .find({ _id: { $in: gearIds } })
            .select('title images')
            .lean()
        : Promise.resolve([]),
    ]);

    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );
    const gearMap = new Map<string, any>(
      gears.map((g: any) => [String(g._id), g] as [string, any]),
    );

    const ratingCount = reviews.length;
    const ratingAvg =
      ratingCount > 0
        ? Math.round(
            (reviews.reduce((sum, r: any) => sum + Number(r.rating), 0) /
              ratingCount) *
              10,
          ) / 10
        : 5.0;

    return {
      targetUserId: String(targetUserId),
      ratingAvg,
      ratingCount,
      items: reviews.map((r: any) => {
        const revProf = profileMap.get(String(r.reviewerId));
        const gear = gearMap.get(String(r.gearId));
        return {
          id: String(r._id),
          bookingId: String(r.bookingId),
          gearId: String(r.gearId),
          gearTitle: gear?.title || 'Thiết bị du lịch',
          reviewerRole: r.reviewerRole || 'RENTER',
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          reviewer: {
            userId: String(r.reviewerId),
            username: revProf?.username || 'member',
            fullName: revProf?.fullName || 'Thành viên TravelShare',
            avatarUrl: revProf?.avatarUrl || '',
          },
        };
      }),
    };
  }

  /**
   * Get reviews for a specific gear item (for GearDetail page)
   */
  async getGearReviews(gearId: string): Promise<Record<string, any>[]> {
    if (!Types.ObjectId.isValid(gearId)) {
      return [];
    }

    const reviews = await this.reviewModel
      .find({
        gearId: new Types.ObjectId(gearId),
        reviewerRole: 'RENTER',
      })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const reviewerIds = Array.from(
      new Set(reviews.map((r: any) => String(r.reviewerId))),
    ).map((id) => new Types.ObjectId(id));

    const profiles =
      reviewerIds.length > 0
        ? await this.profileModel
            .find({ userId: { $in: reviewerIds } })
            .lean()
        : [];
    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );

    return reviews.map((r: any) => {
      const revProf = profileMap.get(String(r.reviewerId));
      return {
        id: String(r._id),
        bookingId: String(r.bookingId),
        gearId: String(r.gearId),
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewer: {
          userId: String(r.reviewerId),
          username: revProf?.username || 'member',
          fullName: revProf?.fullName || 'Thành viên TravelShare',
          avatarUrl: revProf?.avatarUrl || '',
        },
      };
    });
  }

  /**
   * 11. DISPUTE MANAGEMENT
   */
  async createDispute(
    bookingId: string,
    userId: string,
    userRole: string,
    dto: CreateDisputeDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const actorRole = BookingStateMachine.resolveActorRole(
      userId,
      userRole,
      booking,
    );

    if (booking.status !== BookingStatus.DISPUTED) {
      BookingStateMachine.assertValidTransition(
        booking.status,
        BookingStatus.DISPUTED,
        actorRole,
      );
    }

    const isRenter = String(booking.renterId) === String(userId);
    const reportedUserId = isRenter ? booking.ownerId : booking.renterId;

    const existingDispute = await this.disputeModel
      .findOne({
        bookingId: booking._id,
        reporterId: new Types.ObjectId(String(userId)),
      })
      .lean();

    if (existingDispute) {
      throw new ConflictException(
        'Bạn đã gửi báo cáo tranh chấp cho giao dịch này rồi',
      );
    }

    const validatedEvidence = this.mediaService
      ? await this.mediaService.validateAndNormalizeBookingEvidenceUrls({
          bookingId: String(booking._id),
          actorId: String(userId),
          actorRole: userRole,
          urls: dto.evidence,
          scope: 'BOOKING_DISPUTE',
        })
      : dto.evidence || [];

    const createdDispute = await this.disputeModel.create({
      bookingId: booking._id,
      reporterId: new Types.ObjectId(String(userId)),
      reportedUserId: new Types.ObjectId(String(reportedUserId)),
      reason: dto.reason,
      description: dto.description.trim(),
      evidence: validatedEvidence,
      status: DisputeStatus.OPEN,
    });

    if (booking.status !== BookingStatus.DISPUTED) {
      const now = new Date();
      const auditEntry: BookingAuditEntry = {
        fromStatus: booking.status,
        toStatus: BookingStatus.DISPUTED,
        actorId: String(userId),
        actorRole,
        note: `Mở tranh chấp (${dto.reason}): ${dto.description.trim()}`,
        timestamp: now,
      };

      await this.bookingModel.findOneAndUpdate(
        { _id: booking._id },
        {
          $set: { status: BookingStatus.DISPUTED },
          $push: { statusHistory: auditEntry },
        },
      );
    }

    const raw = createdDispute.toObject() as any;
    return {
      id: String(raw._id),
      bookingId: String(raw.bookingId),
      reporterId: String(raw.reporterId),
      reportedUserId: String(raw.reportedUserId),
      reason: raw.reason,
      description: raw.description,
      evidence: raw.evidence || [],
      status: raw.status,
      createdAt: raw.createdAt,
    };
  }

  async getAdminDisputes(userRole: string): Promise<Record<string, any>[]> {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Chỉ quản trị viên (ADMIN) mới có quyền xem danh sách tranh chấp hệ thống',
      );
    }

    const disputes = await this.disputeModel
      .find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return disputes.map((d: any) => ({
      id: String(d._id),
      bookingId: String(d.bookingId),
      reporterId: String(d.reporterId),
      reportedUserId: String(d.reportedUserId),
      reason: d.reason,
      description: d.description,
      evidence: d.evidence || [],
      status: d.status,
      adminNotes: d.adminNotes || '',
      resolvedAt: d.resolvedAt,
      createdAt: d.createdAt,
    }));
  }

  async resolveDispute(
    disputeId: string,
    adminId: string,
    userRole: string,
    dto: ResolveDisputeDto,
  ): Promise<Record<string, any>> {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Chỉ quản trị viên (ADMIN) mới có quyền xử lý tranh chấp',
      );
    }

    if (!Types.ObjectId.isValid(disputeId)) {
      throw new NotFoundException('Không tìm thấy hồ sơ tranh chấp');
    }

    const now = new Date();
    const updated = await this.disputeModel
      .findByIdAndUpdate(
        disputeId,
        {
          $set: {
            status: dto.status,
            adminNotes: dto.adminNotes.trim(),
            resolvedByAdminId: new Types.ObjectId(String(adminId)),
            resolvedAt: now,
          },
        },
        { new: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Không tìm thấy hồ sơ tranh chấp');
    }

    if (
      dto.status === DisputeStatus.RESOLVED_FOR_OWNER ||
      dto.status === DisputeStatus.RESOLVED_FOR_RENTER ||
      dto.status === DisputeStatus.CLOSED
    ) {
      const booking = await this.bookingModel
        .findById(updated.bookingId)
        .lean();
      if (booking && booking.status === BookingStatus.DISPUTED) {
        await this.availabilityService.runGearReservationTransaction(
          String(booking.gearId),
          async ({ session }) => {
            const auditEntry: BookingAuditEntry = {
              fromStatus: BookingStatus.DISPUTED,
              toStatus: BookingStatus.COMPLETED,
              actorId: String(adminId),
              actorRole: 'ADMIN',
              note: `Admin đóng tranh chấp (${dto.status}): ${dto.adminNotes.trim()}`,
              timestamp: now,
            };
            const updOpts = session ? { session } : undefined;
            await this.bookingModel.updateOne(
              { _id: booking._id },
              {
                $set: {
                  status: BookingStatus.COMPLETED,
                  completedAt: now,
                },
                $push: { statusHistory: auditEntry },
              },
              updOpts,
            );
            await this.availabilityService.releaseBookedSlot(
              booking._id,
              session,
            );
            return { result: true, bumpVersion: true };
          },
        );
      }
    }

    return {
      id: String(updated._id),
      bookingId: String(updated.bookingId),
      status: updated.status,
      adminNotes: updated.adminNotes,
      resolvedAt: updated.resolvedAt,
    };
  }

  /**
   * 6 & 7. GET SENT / RECEIVED / SINGLE BOOKING DETAILS
   */
  async getSentBookings(
    renterId: string,
    query: ListBookingsQueryDto,
  ): Promise<Record<string, any>> {
    await this.expireOverdueBookings();

    const filter: Record<string, any> = {
      renterId: new Types.ObjectId(String(renterId)),
    };
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    const hydrated = await this.hydrateBookings(items, renterId);
    return {
      items: hydrated,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getReceivedBookings(
    ownerId: string,
    query: ListBookingsQueryDto,
  ): Promise<Record<string, any>> {
    await this.expireOverdueBookings();

    const filter: Record<string, any> = {
      ownerId: new Types.ObjectId(String(ownerId)),
    };
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    const hydrated = await this.hydrateBookings(items, ownerId);
    return {
      items: hydrated,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getBookingById(
    bookingId: string,
    viewerId: string,
    viewerRole: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    BookingStateMachine.resolveActorRole(viewerId, viewerRole, booking);

    const [hydratedList, handovers, reviews, disputes] = await Promise.all([
      this.hydrateBookings([booking], viewerId, viewerRole),
      this.handoverModel
        .find({ bookingId: booking._id })
        .sort({ createdAt: 1 })
        .lean(),
      this.reviewModel
        .find({ bookingId: booking._id })
        .sort({ createdAt: -1 })
        .lean(),
      this.disputeModel
        .find({ bookingId: booking._id })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const isAdminViewer = viewerRole === UserRole.ADMIN;
    const base = hydratedList[0];
    return {
      ...base,
      handovers: handovers.map((h: any) => ({
        id: String(h._id),
        bookingId: String(h.bookingId),
        handoverType: h.handoverType,
        photos: h.photos || [],
        condition: h.condition,
        notes: h.notes || '',
        confirmedBy: (h.confirmedBy || []).map((id: any) => String(id)),
        confirmations: h.confirmations || [],
        createdAt: h.createdAt,
      })),
      reviews: reviews.map((r: any) => ({
        id: String(r._id),
        reviewerId: String(r.reviewerId),
        targetUserId: String(r.targetUserId),
        reviewerRole: r.reviewerRole || 'RENTER',
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      disputes: disputes.map((d: any) => {
        const isResolved =
          d.status === DisputeStatus.RESOLVED_FOR_OWNER ||
          d.status === DisputeStatus.RESOLVED_FOR_RENTER ||
          d.status === DisputeStatus.CLOSED;
        return {
          id: String(d._id),
          reporterId: String(d.reporterId),
          reportedUserId: String(d.reportedUserId),
          reason: d.reason,
          description: d.description,
          evidence: d.evidence || [],
          status: d.status,
          adminNotes: isAdminViewer || isResolved ? d.adminNotes || '' : '',
          resolvedAt: d.resolvedAt,
          createdAt: d.createdAt,
        };
      }),
    };
  }

  private async hydrateBookings(
    bookings: any[],
    viewerId?: string,
    viewerRole?: string,
  ): Promise<Record<string, any>[]> {
    if (bookings.length === 0) return [];

    const userIds = Array.from(
      new Set(
        bookings.flatMap((b) => [String(b.ownerId), String(b.renterId)]),
      ),
    ).map((id) => new Types.ObjectId(id));

    const gearIds = Array.from(
      new Set(bookings.map((b) => String(b.gearId))),
    ).map((id) => new Types.ObjectId(id));

    const bookingIds = bookings.map((b) => b._id);

    const [profiles, gears, viewerReviews] = await Promise.all([
      userIds.length > 0
        ? this.profileModel.find({ userId: { $in: userIds } }).lean()
        : Promise.resolve([]),
      gearIds.length > 0
        ? this.gearModel.find({ _id: { $in: gearIds } }).lean()
        : Promise.resolve([]),
      viewerId && Types.ObjectId.isValid(viewerId)
        ? this.reviewModel
            .find({
              bookingId: { $in: bookingIds },
              reviewerId: new Types.ObjectId(viewerId),
            })
            .select('bookingId')
            .lean()
        : Promise.resolve([]),
    ]);

    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );
    const gearMap = new Map<string, any>(
      gears.map((g: any) => [String(g._id), g] as [string, any]),
    );
    const reviewedBookingSet = new Set(
      viewerReviews.map((r: any) => String(r.bookingId)),
    );

    return bookings.map((b: any) => {
      const ownerProf = profileMap.get(String(b.ownerId));
      const renterProf = profileMap.get(String(b.renterId));
      const gear = gearMap.get(String(b.gearId));
      const snap = b.pickupLocationSnapshot || {};

      const canSeeOwnerInternalNote =
        viewerRole === UserRole.ADMIN ||
        Boolean(viewerId && String(b.ownerId) === String(viewerId));

      return {
        id: String(b._id),
        gearId: String(b.gearId),
        renterId: String(b.renterId),
        ownerId: String(b.ownerId),
        quantity: b.quantity || 1,
        startAt: b.startAt || b.startDate,
        endAt: b.endAt || b.endDate,
        rentalDays: b.rentalDays || b.totalDays || 1,
        sharingType:
          b.sharingType || gear?.sharingType || GearListingType.RENT,
        status: b.status,
        priceSnapshot: b.priceSnapshot ?? b.unitDailyPriceSnapshotVnd ?? 0,
        rentalTotal: b.rentalTotal ?? b.totalRentalFeeSnapshotVnd ?? 0,
        depositAmount: b.depositAmount ?? b.depositSnapshotVnd ?? 0,
        pickupLocationSnapshot: {
          city: snap.city || gear?.city || 'TP. Hồ Chí Minh',
          district: snap.district || gear?.district || 'Quận 1',
          coordinates: snap.coordinates ||
            gear?.pickupLocation?.coordinates || [106.7009, 10.7769],
          gearTitle: snap.gearTitle || gear?.title || 'Thiết bị du lịch',
          brand: snap.brand || gear?.brand || '',
          condition: snap.condition || gear?.condition || GearCondition.GOOD,
          usageRules: snap.usageRules || gear?.usageRules || [],
          images: snap.images || gear?.images || [],
        },
        renterNote: b.renterNote || '',
        ownerResponseNote: b.ownerResponseNote || '',
        ...(canSeeOwnerInternalNote
          ? { ownerInternalNote: b.ownerInternalNote || '' }
          : {}),
        cancellationReason: b.cancellationReason || '',
        cancelledBy: b.cancelledBy ? String(b.cancelledBy) : undefined,
        approvedAt: b.approvedAt,
        rejectedAt: b.rejectedAt,
        handedOverAt: b.handedOverAt,
        returnedAt: b.returnedAt,
        completedAt: b.completedAt,
        expiresAt: b.expiresAt,
        statusHistory: b.statusHistory || [],
        hasViewerReviewed: reviewedBookingSet.has(String(b._id)),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        owner: {
          userId: String(b.ownerId),
          username: ownerProf?.username || 'owner',
          fullName: ownerProf?.fullName || 'Chủ thiết bị',
          avatarUrl: ownerProf?.avatarUrl || '',
          city: ownerProf?.city || 'Việt Nam',
          trustScore: ownerProf?.trustScore ?? 5.0,
        },
        renter: {
          userId: String(b.renterId),
          username: renterProf?.username || 'renter',
          fullName: renterProf?.fullName || 'Người thuê',
          avatarUrl: renterProf?.avatarUrl || '',
          city: renterProf?.city || 'Việt Nam',
          trustScore: renterProf?.trustScore ?? 5.0,
        },
      };
    });
  }
}
