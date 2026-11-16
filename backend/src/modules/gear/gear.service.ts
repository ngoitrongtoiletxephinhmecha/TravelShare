import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
  GearCategory,
  GearCategoryDocument,
  GearItem,
  GearItemDocument,
  Profile,
  ProfileDocument,
} from '../../database/schemas';
import {
  CreateGearCategoryDto,
  CreateGearDto,
  ModerateGearDto,
  SearchGearQueryDto,
  UpdateGearCategoryDto,
  UpdateGearDto,
  UpdateGearStatusDto,
} from './dto/gear.dto';
import {
  GearListingType,
  GearModerationStatus,
  GearStatus,
  UserRole,
} from '../../common/enums/system.enums';
import { AvailabilityService } from './availability.service';

// Approximate center coordinates [longitude, latitude] for Vietnamese cities/districts
const CITY_COORDINATES: Record<string, [number, number]> = {
  'hà nội': [105.8342, 21.0278],
  'cầu giấy': [105.7906, 21.0362],
  'đống đa': [105.827, 21.018],
  'thanh xuân': [105.8045, 20.9938],
  'tây hồ': [105.8188, 21.0685],
  'hoàn kiếm': [105.8525, 21.0285],
  'nam từ liêm': [105.7647, 21.014],
  'tp. hồ chí minh': [106.6602, 10.7626],
  'hồ chí minh': [106.6602, 10.7626],
  'đà nẵng': [108.2022, 16.0544],
  'đà lạt': [108.4583, 11.9404],
  'lào cai': [103.975, 22.3364],
  'quảng ninh': [107.083, 20.9599],
};

@Injectable()
export class GearService {
  constructor(
    @InjectModel(GearCategory.name)
    private categoryModel: Model<GearCategoryDocument>,
    @InjectModel(GearItem.name)
    private gearModel: Model<GearItemDocument>,
    @InjectModel(Profile.name)
    private profileModel: Model<ProfileDocument>,
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    private availabilityService: AvailabilityService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  private isProductionEnvironment(): boolean {
    return Boolean(
      this.configService?.get<boolean>('isProduction') ||
        this.configService?.get<string>('nodeEnv') === 'production' ||
        process.env.NODE_ENV === 'production',
    );
  }

  // ==========================================
  // 1. GEAR CATEGORY MANAGEMENT
  // ==========================================

  async getCategories(includeInactive = false): Promise<Record<string, any>[]> {
    const filter = includeInactive ? {} : { isActive: { $ne: false } };
    const categories = await this.categoryModel
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return categories.map((c: any) => ({
      id: String(c._id),
      code: c.code,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      icon: c.icon || c.iconName || 'Tent',
      iconName: c.iconName || c.icon || 'Tent',
      parentCategoryId: c.parentCategoryId ? String(c.parentCategoryId) : null,
      attributesSchema: c.attributesSchema || [],
      isActive: c.isActive !== false,
      sortOrder: c.sortOrder || 0,
    }));
  }

  async createCategory(
    dto: CreateGearCategoryDto,
  ): Promise<Record<string, any>> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.categoryModel.findOne({ code });
    if (existing) {
      throw new ConflictException(`Danh mục với mã "${code}" đã tồn tại`);
    }

    const slug = code.toLowerCase().replace(/_/g, '-');
    const created = await this.categoryModel.create({
      code,
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim() || '',
      icon: dto.icon || 'Tent',
      iconName: dto.icon || 'Tent',
      parentCategoryId:
        dto.parentCategoryId && Types.ObjectId.isValid(dto.parentCategoryId)
          ? new Types.ObjectId(dto.parentCategoryId)
          : null,
      attributesSchema: dto.attributesSchema || [],
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });

    const raw = created.toObject() as any;
    return {
      id: String(raw._id),
      code: raw.code,
      name: raw.name,
      slug: raw.slug,
      description: raw.description,
      icon: raw.icon,
      parentCategoryId: raw.parentCategoryId
        ? String(raw.parentCategoryId)
        : null,
      attributesSchema: raw.attributesSchema || [],
      isActive: raw.isActive,
      sortOrder: raw.sortOrder,
    };
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateGearCategoryDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw new NotFoundException('Không tìm thấy danh mục thiết bị');
    }

    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục thiết bị');
    }

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.description !== undefined)
      category.description = dto.description.trim();
    if (dto.icon !== undefined) {
      category.icon = dto.icon;
      category.iconName = dto.icon;
    }
    if (dto.parentCategoryId !== undefined) {
      category.parentCategoryId =
        dto.parentCategoryId && Types.ObjectId.isValid(dto.parentCategoryId)
          ? new Types.ObjectId(dto.parentCategoryId)
          : null;
    }
    if (dto.attributesSchema !== undefined) {
      category.attributesSchema = dto.attributesSchema;
    }
    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }
    if (dto.sortOrder !== undefined) {
      category.sortOrder = dto.sortOrder;
    }

    await category.save();
    const raw = category.toObject() as any;
    return {
      id: String(raw._id),
      code: raw.code,
      name: raw.name,
      slug: raw.slug,
      description: raw.description,
      icon: raw.icon,
      parentCategoryId: raw.parentCategoryId
        ? String(raw.parentCategoryId)
        : null,
      attributesSchema: raw.attributesSchema || [],
      isActive: raw.isActive,
      sortOrder: raw.sortOrder,
    };
  }

  // ==========================================
  // 2. GEAR ITEM MANAGEMENT
  // ==========================================

  async createGear(
    userId: string,
    dto: CreateGearDto,
  ): Promise<Record<string, any>> {
    this.validateNoBase64Images(dto.images);
    this.validatePricingRules(
      dto.sharingType,
      dto.pricePerDay,
      dto.depositAmount,
    );

    const categoryCode = dto.categoryCode.trim().toUpperCase();
    const category = await this.categoryModel
      .findOne({ code: categoryCode, isActive: { $ne: false } })
      .lean();
    if (!category) {
      throw new BadRequestException(
        `Danh mục thiết bị "${categoryCode}" không tồn tại hoặc đã ngừng hoạt động`,
      );
    }

    const coordinates = this.resolveCoordinates(
      dto.longitude,
      dto.latitude,
      dto.city,
      dto.district,
    );

    const status =
      dto.status === GearStatus.DRAFT ? GearStatus.DRAFT : GearStatus.ACTIVE;
    const pricePerDay =
      dto.sharingType === GearListingType.FREE_LOAN ? 0 : dto.pricePerDay;

    const gear = await this.gearModel.create({
      ownerId: new Types.ObjectId(userId),
      categoryId: category._id as Types.ObjectId,
      categoryCode,
      title: dto.title.trim(),
      description: dto.description.trim(),
      brand: dto.brand?.trim() || '',
      condition: dto.condition,
      attributes: dto.attributes || {},
      images: dto.images || [],
      totalQuantity: dto.totalQuantity || 1,
      sharingType: dto.sharingType,
      listingType: dto.sharingType,
      pricePerDay,
      dailyPriceVnd: pricePerDay,
      depositAmount: dto.depositAmount,
      depositAmountVnd: dto.depositAmount,
      city: dto.city.trim(),
      district: dto.district.trim(),
      pickupLocation: {
        type: 'Point',
        coordinates, // [longitude, latitude]
      },
      usageRules: dto.usageRules || [],
      availabilitySettings: {
        minRentalDays: dto.availabilitySettings?.minRentalDays || 1,
        maxRentalDays: dto.availabilitySettings?.maxRentalDays || 14,
        advanceNoticeHours: dto.availabilitySettings?.advanceNoticeHours ?? 4,
      },
      status,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: status === GearStatus.ACTIVE,
      isDemo: false,
    });

    const [enriched] = await this.enrichGearItems([gear.toObject()]);
    return enriched;
  }

  async updateGear(
    userId: string,
    userRole: string,
    gearId: string,
    dto: UpdateGearDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(gearId);
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    if (this.isProductionEnvironment() && gear.isDemo) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const isOwner = String(gear.ownerId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa thiết bị của người khác',
      );
    }

    if (dto.images) {
      this.validateNoBase64Images(dto.images);
      gear.images = dto.images;
    }

    const nextSharingType = dto.sharingType ?? gear.sharingType;
    const nextPricePerDay =
      dto.pricePerDay !== undefined ? dto.pricePerDay : gear.pricePerDay;
    const nextDeposit =
      dto.depositAmount !== undefined ? dto.depositAmount : gear.depositAmount;

    this.validatePricingRules(nextSharingType, nextPricePerDay, nextDeposit);

    if (dto.categoryCode) {
      const code = dto.categoryCode.trim().toUpperCase();
      const cat = await this.categoryModel
        .findOne({ code, isActive: { $ne: false } })
        .lean();
      if (!cat) {
        throw new BadRequestException(`Danh mục "${code}" không hợp lệ`);
      }
      gear.categoryCode = code;
      gear.categoryId = cat._id as Types.ObjectId;
    }

    if (dto.title !== undefined) gear.title = dto.title.trim();
    if (dto.description !== undefined)
      gear.description = dto.description.trim();
    if (dto.brand !== undefined) gear.brand = dto.brand.trim();
    if (dto.condition !== undefined) gear.condition = dto.condition;
    if (dto.attributes !== undefined) gear.attributes = dto.attributes;
    if (dto.totalQuantity !== undefined) {
      const nextTotalQty = Math.max(1, Number(dto.totalQuantity) || 1);
      if (nextTotalQty < (gear.totalQuantity || 1)) {
        const futurePeak =
          await this.availabilityService.getMaxFuturePeakReservedQuantity(
            gear._id as any,
          );
        if (nextTotalQty < futurePeak) {
          throw new ConflictException(
            `Không thể giảm tổng số lượng xuống ${nextTotalQty} vì hiện có ${futurePeak} chiếc đang được giữ chỗ hoặc khóa lịch`,
          );
        }
      }
      gear.totalQuantity = nextTotalQty;
    }

    gear.sharingType = nextSharingType;
    gear.listingType = nextSharingType;
    gear.pricePerDay =
      nextSharingType === GearListingType.FREE_LOAN ? 0 : nextPricePerDay;
    gear.dailyPriceVnd = gear.pricePerDay;
    gear.depositAmount = nextDeposit;
    gear.depositAmountVnd = nextDeposit;

    if (dto.city !== undefined) gear.city = dto.city.trim();
    if (dto.district !== undefined) gear.district = dto.district.trim();

    if (
      dto.longitude !== undefined ||
      dto.latitude !== undefined ||
      dto.city !== undefined ||
      dto.district !== undefined
    ) {
      const coords = this.resolveCoordinates(
        dto.longitude ?? gear.pickupLocation?.coordinates?.[0],
        dto.latitude ?? gear.pickupLocation?.coordinates?.[1],
        gear.city,
        gear.district,
      );
      gear.pickupLocation = {
        type: 'Point',
        coordinates: coords,
      };
    }

    if (dto.usageRules !== undefined) gear.usageRules = dto.usageRules;
    if (dto.availabilitySettings !== undefined) {
      gear.availabilitySettings = {
        minRentalDays:
          dto.availabilitySettings.minRentalDays ??
          gear.availabilitySettings?.minRentalDays ??
          1,
        maxRentalDays:
          dto.availabilitySettings.maxRentalDays ??
          gear.availabilitySettings?.maxRentalDays ??
          14,
        advanceNoticeHours:
          dto.availabilitySettings.advanceNoticeHours ??
          gear.availabilitySettings?.advanceNoticeHours ??
          4,
      };
    }

    if (dto.status !== undefined) {
      gear.status = dto.status;
    }

    gear.isActive =
      gear.status === GearStatus.ACTIVE &&
      gear.moderationStatus === GearModerationStatus.APPROVED;

    if (
      (dto.totalQuantity !== undefined || dto.status !== undefined) &&
      typeof this.gearModel.findOneAndUpdate === 'function'
    ) {
      const savedObj = await this.availabilityService.runGearReservationTransaction(
        gearId,
        async ({ gear: txGear, session }) => {
          const nextTotalQty =
            dto.totalQuantity !== undefined
              ? Math.max(1, Number(dto.totalQuantity) || 1)
              : Math.max(1, Number(txGear.totalQuantity) || 1);

          if (nextTotalQty < Math.max(1, Number(txGear.totalQuantity) || 1)) {
            const futurePeak =
              await this.availabilityService.getMaxFuturePeakReservedQuantity(
                txGear._id,
                new Date(),
                session,
              );
            if (nextTotalQty < futurePeak) {
              throw new ConflictException(
                `Không thể giảm tổng số lượng xuống ${nextTotalQty} vì hiện có ${futurePeak} chiếc đang được giữ chỗ hoặc khóa lịch`,
              );
            }
          }

          const updatedGearDoc = {
            categoryCode: gear.categoryCode,
            categoryId: gear.categoryId,
            title: gear.title,
            description: gear.description,
            brand: gear.brand,
            condition: gear.condition,
            attributes: gear.attributes,
            images: gear.images,
            totalQuantity: nextTotalQty,
            sharingType: gear.sharingType,
            listingType: gear.listingType,
            pricePerDay: gear.pricePerDay,
            dailyPriceVnd: gear.dailyPriceVnd,
            depositAmount: gear.depositAmount,
            depositAmountVnd: gear.depositAmountVnd,
            city: gear.city,
            district: gear.district,
            pickupLocation: gear.pickupLocation,
            usageRules: gear.usageRules,
            availabilitySettings: gear.availabilitySettings,
            status: gear.status,
            isActive: gear.isActive,
          };

          const q = this.gearModel.findById(gearId);
          if (session && typeof (q as any).session === 'function') {
            (q as any).session(session);
          }
          const latestPlain = await q.lean();
          return {
            result: { ...latestPlain, ...updatedGearDoc, _id: gear._id },
            gearSet: updatedGearDoc,
          };
        },
      );
      const [enriched] = await this.enrichGearItems([savedObj]);
      return enriched;
    }

    await gear.save();
    const [enriched] = await this.enrichGearItems([gear.toObject()]);
    return enriched;
  }

  async updateGearStatus(
    userId: string,
    userRole: string,
    gearId: string,
    dto: UpdateGearStatusDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(gearId);
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    if (this.isProductionEnvironment() && gear.isDemo) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const isOwner = String(gear.ownerId) === String(userId);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Bạn không có quyền thay đổi trạng thái thiết bị này',
      );
    }

    // Soft-archive check: never hard delete, preserve reference for bookings
    if (typeof this.gearModel.findOneAndUpdate === 'function') {
      const updated =
        await this.availabilityService.runGearReservationTransaction(
          gearId,
          async ({ gear: txGear }) => {
            const nextIsActive =
              dto.status === GearStatus.ACTIVE &&
              txGear.moderationStatus === GearModerationStatus.APPROVED;
            return {
              result: {
                ...txGear,
                status: dto.status,
                isActive: nextIsActive,
              },
              gearSet: {
                status: dto.status,
                isActive: nextIsActive,
              },
            };
          },
        );
      const [enriched] = await this.enrichGearItems([updated]);
      return enriched;
    }

    gear.status = dto.status;
    gear.isActive =
      gear.status === GearStatus.ACTIVE &&
      gear.moderationStatus === GearModerationStatus.APPROVED;

    await gear.save();
    const [enriched] = await this.enrichGearItems([gear.toObject()]);
    return enriched;
  }

  async moderateGear(
    gearId: string,
    dto: ModerateGearDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(gearId)) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const gear = await this.gearModel.findById(gearId);
    if (!gear) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    if (this.isProductionEnvironment() && gear.isDemo) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    gear.moderationStatus = dto.moderationStatus;
    gear.isActive =
      gear.status === GearStatus.ACTIVE &&
      gear.moderationStatus === GearModerationStatus.APPROVED;

    await gear.save();
    const [enriched] = await this.enrichGearItems([gear.toObject()]);
    return enriched;
  }

  async getMyGearItems(
    userId: string,
    status?: GearStatus,
  ): Promise<Record<string, any>[]> {
    const filter: FilterQuery<GearItemDocument> = {
      ownerId: new Types.ObjectId(userId),
    };
    if (status) {
      filter.status = status;
    }

    const items = await this.gearModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .lean();

    return this.enrichGearItems(items);
  }

  async getPublicGearByOwner(
    ownerIdentifier: string,
  ): Promise<Record<string, any>[]> {
    let ownerId: Types.ObjectId | null = null;
    if (Types.ObjectId.isValid(ownerIdentifier)) {
      ownerId = new Types.ObjectId(ownerIdentifier);
    } else {
      const profile = await this.profileModel
        .findOne({ username: ownerIdentifier.toLowerCase() })
        .lean();
      if (profile) {
        ownerId = profile.userId;
      }
    }

    if (!ownerId) return [];

    const items = await this.gearModel
      .find({
        ownerId,
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
        ...(this.isProductionEnvironment() ? { isDemo: { $ne: true } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return this.enrichGearItems(items);
  }

  async getGearById(
    gearId: string,
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

    if (this.isProductionEnvironment() && gear.isDemo) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const isOwner = Boolean(
      viewerId && String(gear.ownerId) === String(viewerId),
    );
    const isAdmin = viewerRole === UserRole.ADMIN;

    // Security rule: Never expose DRAFT or ARCHIVED or unapproved items to unauthorized viewers
    if (
      (gear.status === GearStatus.DRAFT ||
        gear.status === GearStatus.ARCHIVED ||
        gear.moderationStatus !== GearModerationStatus.APPROVED) &&
      !isOwner &&
      !isAdmin
    ) {
      throw new NotFoundException(
        'Thiết bị không tồn tại hoặc đang ở trạng thái bản nháp/lưu trữ',
      );
    }

    const [enriched] = await this.enrichGearItems([gear]);
    const availability = await this.availabilityService.getGearAvailability(
      gearId,
      undefined,
      viewerId,
      viewerRole,
    );

    const similarRaw = await this.gearModel
      .find({
        _id: { $ne: gear._id },
        categoryCode: gear.categoryCode,
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
        ...(this.isProductionEnvironment() ? { isDemo: { $ne: true } } : {}),
      })
      .sort({ ratingAvg: -1, createdAt: -1 })
      .limit(4)
      .lean();

    const similarItems = await this.enrichGearItems(similarRaw);

    return {
      ...enriched,
      availability,
      similarItems,
    };
  }

  async searchGear(query: SearchGearQueryDto): Promise<Record<string, any>> {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 48);

    // Public Marketplace strictly shows only ACTIVE + APPROVED gear (and blocks demo listings in production)
    const andConditions: FilterQuery<GearItemDocument>[] = [
      {
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
        ...(this.isProductionEnvironment() ? { isDemo: { $ne: true } } : {}),
      },
    ];

    if (query.categoryCode && query.categoryCode !== 'ALL') {
      andConditions.push({
        categoryCode: query.categoryCode.trim().toUpperCase(),
      });
    }

    if (query.sharingType) {
      if (query.sharingType === GearListingType.FREE_LOAN) {
        andConditions.push({
          $or: [
            { sharingType: GearListingType.FREE_LOAN },
            { sharingType: GearListingType.BOTH },
            { pricePerDay: 0 },
          ],
        });
      } else if (query.sharingType === GearListingType.RENT) {
        andConditions.push({
          sharingType: { $in: [GearListingType.RENT, GearListingType.BOTH] },
        });
      } else {
        andConditions.push({ sharingType: query.sharingType });
      }
    }

    if (query.condition) {
      andConditions.push({ condition: query.condition });
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (query.minPrice !== undefined) priceFilter.$gte = query.minPrice;
      if (query.maxPrice !== undefined) priceFilter.$lte = query.maxPrice;
      andConditions.push({ pricePerDay: priceFilter });
    }

    if (query.city && query.city.trim()) {
      const escapedCity = query.city
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      andConditions.push({ city: new RegExp(escapedCity, 'i') });
    }

    if (query.q && query.q.trim()) {
      const escaped = query.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      andConditions.push({
        $or: [
          { title: regex },
          { description: regex },
          { brand: regex },
          { city: regex },
          { district: regex },
        ],
      });
    }

    // Geolocation radius filter [lng, lat]
    const hasGeoQuery =
      query.lng !== undefined &&
      query.lat !== undefined &&
      !isNaN(Number(query.lng)) &&
      !isNaN(Number(query.lat));
    const radiusKm = Number(query.radiusKm) || 25;

    if (hasGeoQuery) {
      const earthRadiusKm = 6378.1;
      andConditions.push({
        pickupLocation: {
          $geoWithin: {
            $centerSphere: [
              [Number(query.lng), Number(query.lat)],
              radiusKm / earthRadiusKm,
            ],
          },
        },
      });
    }

    const filter: FilterQuery<GearItemDocument> =
      andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    // Date range availability filter [startAt, endAt) + shared duration & peak occupancy validation
    let reservedMap: Map<string, number> | null = null;
    let parsedSearchInterval: {
      startAt: Date;
      endAt: Date;
      rentalDays: number;
    } | null = null;
    const requestedQty = Math.max(1, Number(query.quantity) || 1);

    if (query.startAt && query.endAt) {
      parsedSearchInterval = this.availabilityService.parseAndValidateInterval(
        query.startAt,
        query.endAt,
      );
      reservedMap = await this.availabilityService.getOverlappingReservedMap(
        parsedSearchInterval.startAt,
        parsedSearchInterval.endAt,
      );
    }

    const rawCandidates = await this.gearModel.find(filter).lean();

    // Filter out ineligible listings, duration-rule violations, and insufficient remaining units
    const availableCandidates =
      reservedMap && parsedSearchInterval
        ? rawCandidates.filter((g: any) => {
            if (!this.availabilityService.isGearEligibleForBooking(g).eligible) {
              return false;
            }
            const dur =
              this.availabilityService.validateRentalDurationAndNotice(
                g,
                parsedSearchInterval!.startAt,
                parsedSearchInterval!.rentalDays,
              );
            if (!dur.valid) return false;
            const reserved = reservedMap!.get(String(g._id)) || 0;
            const available = Math.max(
              0,
              Math.max(1, Number(g.totalQuantity) || 1) - reserved,
            );
            return available >= requestedQty;
          })
        : rawCandidates;

    // Enrich and compute distanceKm if geo coordinates provided
    let enrichedItems = await this.enrichGearItems(
      availableCandidates,
      hasGeoQuery ? [Number(query.lng), Number(query.lat)] : undefined,
    );

    if (reservedMap && parsedSearchInterval) {
      enrichedItems = enrichedItems.map((item) => {
        const reserved = reservedMap!.get(String(item.id)) || 0;
        const availableQuantity = Math.max(
          0,
          Math.max(1, Number(item.totalQuantity) || 1) - reserved,
        );
        const quote = this.availabilityService.calculateRentalQuote(
          item,
          parsedSearchInterval!.rentalDays,
          requestedQty,
        );
        return {
          ...item,
          availableQuantity,
          estimatedQuoteVnd: quote,
        };
      });
    }

    // Sort results
    const sortBy = query.sortBy || 'newest';
    if (sortBy === 'price_asc') {
      enrichedItems.sort((a, b) => a.pricePerDay - b.pricePerDay);
    } else if (sortBy === 'price_desc') {
      enrichedItems.sort((a, b) => b.pricePerDay - a.pricePerDay);
    } else if (sortBy === 'distance' && hasGeoQuery) {
      enrichedItems.sort(
        (a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999),
      );
    } else {
      enrichedItems.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const total = enrichedItems.length;
    const startIndex = (page - 1) * limit;
    const pagedItems = enrichedItems.slice(startIndex, startIndex + limit);

    return {
      items: pagedItems,
      total,
      page,
      limit,
      hasMore: startIndex + pagedItems.length < total,
    };
  }

  // ==========================================
  // 3. PRIVATE HELPERS & VALIDATION
  // ==========================================

  private validatePricingRules(
    sharingType: GearListingType,
    pricePerDay: number,
    depositAmount: number,
  ) {
    if (pricePerDay < 0 || depositAmount < 0) {
      throw new BadRequestException(
        'Giá thuê và tiền cọc không được phép là số âm',
      );
    }

    if (sharingType === GearListingType.FREE_LOAN && pricePerDay > 0) {
      throw new BadRequestException(
        'Thiết bị cho mượn miễn phí (FREE_LOAN) phải có giá thuê bằng 0 VND',
      );
    }

    if (
      (sharingType === GearListingType.RENT ||
        sharingType === GearListingType.BOTH) &&
      (!pricePerDay || pricePerDay <= 0)
    ) {
      throw new BadRequestException(
        'Thiết bị cho thuê (RENT hoặc BOTH) bắt buộc phải có giá thuê lớn hơn 0 VND/ngày',
      );
    }
  }

  private validateNoBase64Images(images?: string[]) {
    if (!images || images.length === 0) return;
    for (const img of images) {
      if (img.trim().startsWith('data:')) {
        throw new BadRequestException(
          'Không cho phép lưu chuỗi ảnh base64 trực tiếp. Vui lòng upload qua /api/v1/media/upload.',
        );
      }
    }
  }

  private resolveCoordinates(
    lng?: number,
    lat?: number,
    city?: string,
    district?: string,
  ): [number, number] {
    if (
      lng !== undefined &&
      lat !== undefined &&
      !isNaN(Number(lng)) &&
      !isNaN(Number(lat))
    ) {
      return [Number(lng), Number(lat)];
    }

    const districtKey = (district || '').trim().toLowerCase();
    if (CITY_COORDINATES[districtKey]) {
      return CITY_COORDINATES[districtKey];
    }

    const cityKey = (city || '').trim().toLowerCase();
    for (const [k, coords] of Object.entries(CITY_COORDINATES)) {
      if (cityKey.includes(k)) {
        return coords;
      }
    }

    // Default approximate center in Hanoi [lng, lat]
    return [105.8342, 21.0278];
  }

  private calculateHaversineKm(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  private async enrichGearItems(
    rawItems: any[],
    viewerCoords?: [number, number],
  ): Promise<Record<string, any>[]> {
    if (rawItems.length === 0) return [];

    const ownerIds = Array.from(
      new Set(rawItems.map((g) => String(g.ownerId))),
    ).map((id) => new Types.ObjectId(id));

    const [profiles, categories] = await Promise.all([
      this.profileModel.find({ userId: { $in: ownerIds } }).lean(),
      this.categoryModel.find().lean(),
    ]);

    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );
    const categoryMap = new Map<string, any>(
      categories.map((c: any) => [c.code, c] as [string, any]),
    );

    return rawItems.map((g: any) => {
      const ownerProf = profileMap.get(String(g.ownerId));
      const cat = categoryMap.get(g.categoryCode);
      const pricePerDay = g.pricePerDay ?? g.dailyPriceVnd ?? 0;
      const depositAmount = g.depositAmount ?? g.depositAmountVnd ?? 0;
      const sharingType =
        g.sharingType ||
        g.listingType ||
        (pricePerDay === 0 ? GearListingType.FREE_LOAN : GearListingType.RENT);

      const coords: [number, number] = g.pickupLocation?.coordinates || [
        105.8342, 21.0278,
      ];

      let distanceKm: number | null = null;
      if (viewerCoords) {
        distanceKm = this.calculateHaversineKm(
          viewerCoords[0],
          viewerCoords[1],
          coords[0],
          coords[1],
        );
      }

      return {
        id: String(g._id),
        ownerId: String(g.ownerId),
        owner: {
          userId: String(g.ownerId),
          username: ownerProf?.username || 'member',
          fullName: ownerProf?.fullName || 'Thành viên TravelShare',
          avatarUrl: ownerProf?.avatarUrl || '',
          city: ownerProf?.city || g.city,
          trustScore: ownerProf?.trustScore ?? 5.0,
        },
        categoryCode: g.categoryCode,
        categoryName: cat?.name || g.categoryCode,
        title: g.title,
        description: g.description,
        brand: g.brand || '',
        condition: g.condition,
        attributes: g.attributes || {},
        images: g.images || [],
        totalQuantity: g.totalQuantity || 1,
        sharingType,
        pricePerDay,
        depositAmount,
        city: g.city,
        district: g.district,
        pickupAreaLabel: `${g.district}, ${g.city}`,
        pickupLocation: {
          type: 'Point',
          // Round coordinates to 3 decimals (~110m precision) to protect exact home address privacy
          coordinates: [
            Math.round(coords[0] * 1000) / 1000,
            Math.round(coords[1] * 1000) / 1000,
          ],
        },
        distanceKm,
        usageRules: g.usageRules || [],
        availabilitySettings: g.availabilitySettings || {
          minRentalDays: 1,
          maxRentalDays: 14,
          advanceNoticeHours: 4,
        },
        status: g.status || GearStatus.ACTIVE,
        moderationStatus: g.moderationStatus || GearModerationStatus.APPROVED,
        ratingAvg: g.ratingAvg ?? 5.0,
        ratingCount: g.ratingCount ?? 0,
        isDemo: Boolean(g.isDemo),
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
    });
  }
}
