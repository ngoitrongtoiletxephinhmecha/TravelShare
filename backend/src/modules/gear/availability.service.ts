import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  GearAvailability,
  GearAvailabilityDocument,
  GearItem,
  GearItemDocument,
} from '../../database/schemas';
import {
  CheckAvailabilityQueryDto,
  CreateUnavailablePeriodDto,
} from './dto/gear.dto';
import { UserRole } from '../../common/enums/system.enums';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(GearAvailability.name)
    private availabilityModel: Model<GearAvailabilityDocument>,
    @InjectModel(GearItem.name)
    private gearModel: Model<GearItemDocument>,
  ) {}

  /**
   * Parse and validate interval [startAt, endAt)
   * Also calculates rentalDays using Asia/Ho_Chi_Minh calendar day difference or exact 24h ceiling.
   */
  parseAndValidateInterval(rawStart: string | Date, rawEnd: string | Date) {
    const startAt =
      rawStart instanceof Date ? rawStart : new Date(String(rawStart));
    const endAt = rawEnd instanceof Date ? rawEnd : new Date(String(rawEnd));

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

    const diffMs = endAt.getTime() - startAt.getTime();
    const rentalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return { startAt, endAt, rentalDays };
  }

  /**
   * Query overlapping OWNER_BLOCKED periods for a gear item in [startAt, endAt)
   */
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
    if (session) {
      query.session(session);
    }
    const periods = await query.lean();
    return periods.reduce((sum, p: any) => sum + (p.reservedQuantity || 1), 0);
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
   * Release a BOOKED availability slot when a booking is cancelled, expired, or completed
   */
  async releaseBookedSlot(
    bookingId: string | Types.ObjectId,
    session?: ClientSession | null,
  ): Promise<void> {
    const query = this.availabilityModel.deleteMany({
      bookingId: new Types.ObjectId(String(bookingId)),
      reason: 'BOOKED',
    });
    if (session) {
      query.session(session);
    }
    await query;
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

    const gear = await this.gearModel.findById(gearId).lean();
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const isOwner = String(gear.ownerId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Chỉ chủ sở hữu thiết bị hoặc Admin mới được phép khóa lịch khả dụng',
      );
    }

    const { startAt, endAt } = this.parseAndValidateInterval(
      dto.startAt,
      dto.endAt,
    );

    const reservedQty = Math.min(
      Math.max(Number(dto.reservedQuantity) || 1, 1),
      gear.totalQuantity || 1,
    );

    const created = await this.availabilityModel.create({
      gearId: new Types.ObjectId(gearId),
      startAt,
      endAt,
      startDate: startAt,
      endDate: endAt,
      reservedQuantity: reservedQty,
      reason: 'OWNER_BLOCKED',
      note: dto.note?.trim() || 'Chủ thiết bị khóa lịch thủ công',
    });

    const raw = created.toObject() as any;
    return {
      id: String(raw._id),
      gearId: String(raw.gearId),
      startAt: raw.startAt,
      endAt: raw.endAt,
      reservedQuantity: raw.reservedQuantity,
      reason: raw.reason,
      note: raw.note,
      createdAt: raw.createdAt,
    };
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

    const gear = await this.gearModel.findById(gearId).lean();
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const isOwner = String(gear.ownerId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền mở khóa lịch của thiết bị này',
      );
    }

    const period = await this.availabilityModel.findOne({
      _id: new Types.ObjectId(periodId),
      gearId: new Types.ObjectId(gearId),
    });

    if (!period) {
      throw new NotFoundException('Không tìm thấy khoảng thời gian đã khóa');
    }

    if (period.reason === 'BOOKED') {
      throw new BadRequestException(
        'Không thể xóa trực tiếp lịch đã được giữ chỗ bởi giao dịch thuê (BOOKED)',
      );
    }

    await this.availabilityModel.deleteOne({ _id: period._id });
    return {
      deleted: true,
      periodId,
    };
  }

  async getGearAvailability(
    gearId: string,
    query?: CheckAvailabilityQueryDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(gearId).lean();
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const periods = await this.availabilityModel
      .find({ gearId: new Types.ObjectId(gearId) })
      .sort({ startAt: 1 })
      .lean();

    const formattedPeriods = periods.map((p: any) => ({
      id: String(p._id),
      gearId: String(p.gearId),
      bookingId: p.bookingId ? String(p.bookingId) : undefined,
      startAt: p.startAt || p.startDate,
      endAt: p.endAt || p.endDate,
      reservedQuantity: p.reservedQuantity || 1,
      reason: p.reason,
      note: p.note || '',
    }));

    // If startAt and endAt are supplied, evaluate availability on [startAt, endAt)
    if (query?.startAt && query?.endAt) {
      const { startAt, endAt, rentalDays } = this.parseAndValidateInterval(
        query.startAt,
        query.endAt,
      );
      const requestedQuantity = Math.max(Number(query.quantity) || 1, 1);

      // Overlap on [startAt, endAt): p.startAt < endAt && p.endAt > startAt
      const overlapping = formattedPeriods.filter((p) => {
        const pStart = new Date(p.startAt);
        const pEnd = new Date(p.endAt);
        return pStart < endAt && pEnd > startAt;
      });

      const reservedDuringInterval = overlapping.reduce(
        (sum, p) => sum + (p.reservedQuantity || 1),
        0,
      );
      const availableQuantity = Math.max(
        0,
        (gear.totalQuantity || 1) - reservedDuringInterval,
      );
      const isAvailable =
        gear.status === 'ACTIVE' &&
        gear.moderationStatus === 'APPROVED' &&
        availableQuantity >= requestedQuantity;

      const unitPrice =
        gear.sharingType === 'FREE_LOAN'
          ? 0
          : (gear.pricePerDay ?? gear.dailyPriceVnd ?? 0);
      const deposit = gear.depositAmount ?? gear.depositAmountVnd ?? 0;

      return {
        gearId: String(gear._id),
        totalQuantity: gear.totalQuantity || 1,
        requestedInterval: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          rentalDays,
          requestedQuantity,
        },
        isAvailable,
        availableQuantity,
        estimatedCostVnd: {
          pricePerDay: unitPrice,
          totalRentalFee: unitPrice * rentalDays * requestedQuantity,
          depositAmount: deposit * requestedQuantity,
        },
        conflictingPeriods: overlapping,
        periods: formattedPeriods,
      };
    }

    return {
      gearId: String(gear._id),
      totalQuantity: gear.totalQuantity || 1,
      isAvailable:
        gear.status === 'ACTIVE' && gear.moderationStatus === 'APPROVED',
      availableQuantity: gear.totalQuantity || 1,
      periods: formattedPeriods,
    };
  }

  /**
   * Find gearIds that have overlapping reservations in [startAt, endAt)
   */
  async getOverlappingReservedMap(
    startAt: Date,
    endAt: Date,
  ): Promise<Map<string, number>> {
    const overlapping = await this.availabilityModel
      .find({
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      })
      .select('gearId reservedQuantity')
      .lean();

    const reservedMap = new Map<string, number>();
    for (const item of overlapping) {
      const key = String(item.gearId);
      reservedMap.set(
        key,
        (reservedMap.get(key) || 0) + (item.reservedQuantity || 1),
      );
    }
    return reservedMap;
  }
}
