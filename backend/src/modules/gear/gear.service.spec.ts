import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { GearService } from './gear.service';
import { AvailabilityService } from './availability.service';
import {
  Booking,
  GearAvailability,
  GearCategory,
  GearItem,
  Profile,
} from '../../database/schemas';
import {
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  UserRole,
} from '../../common/enums/system.enums';

describe('GearService & AvailabilityService (Phase 3 Marketplace Tests)', () => {
  let gearService: GearService;
  let availabilityService: AvailabilityService;
  let mockCategoryModel: any;
  let mockGearModel: any;
  let mockAvailabilityModel: any;
  let mockProfileModel: any;

  const ownerId = new Types.ObjectId().toHexString();
  const otherUserId = new Types.ObjectId().toHexString();
  const gearId = new Types.ObjectId().toHexString();
  const categoryId = new Types.ObjectId().toHexString();

  beforeEach(async () => {
    mockCategoryModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(categoryId),
              code: 'TENT',
              name: 'Lều trại',
              slug: 'leu-trai',
              isActive: true,
              attributesSchema: [],
            },
          ]),
        }),
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(categoryId),
            code: 'TENT',
            name: 'Lều trại',
          },
        ]),
      }),
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    mockGearModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };

    mockAvailabilityModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      deleteOne: jest.fn(),
    };

    mockProfileModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            userId: new Types.ObjectId(ownerId),
            username: 'quan_trekking',
            fullName: 'Trần Minh Quân',
            city: 'Hà Nội',
            trustScore: 4.9,
          },
        ]),
      }),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GearService,
        AvailabilityService,
        { provide: getModelToken(GearCategory.name), useValue: mockCategoryModel },
        { provide: getModelToken(GearItem.name), useValue: mockGearModel },
        {
          provide: getModelToken(GearAvailability.name),
          useValue: mockAvailabilityModel,
        },
        { provide: getModelToken(Profile.name), useValue: mockProfileModel },
        { provide: getModelToken(Booking.name), useValue: {} },
      ],
    }).compile();

    gearService = module.get<GearService>(GearService);
    availabilityService = module.get<AvailabilityService>(AvailabilityService);
  });

  it('1. allows user to create a valid gear item with GeoJSON coordinates', async () => {
    mockCategoryModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(categoryId),
        code: 'TENT',
        name: 'Lều trại',
        isActive: true,
      }),
    });

    const createdDoc = {
      _id: new Types.ObjectId(gearId),
      ownerId: new Types.ObjectId(ownerId),
      categoryCode: 'TENT',
      title: 'Lều Naturehike Cloud Up 2',
      description: 'Lều 2 người chống mưa',
      condition: GearCondition.LIKE_NEW,
      sharingType: GearListingType.RENT,
      pricePerDay: 80000,
      depositAmount: 500000,
      totalQuantity: 1,
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      pickupLocation: {
        type: 'Point',
        coordinates: [105.7906, 21.0362],
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockGearModel.create.mockResolvedValue({
      toObject: () => createdDoc,
    });

    const res = await gearService.createGear(ownerId, {
      categoryCode: 'TENT',
      title: 'Lều Naturehike Cloud Up 2',
      description: 'Lều 2 người chống mưa',
      condition: GearCondition.LIKE_NEW,
      sharingType: GearListingType.RENT,
      pricePerDay: 80000,
      depositAmount: 500000,
      city: 'Hà Nội',
      district: 'Cầu Giấy',
    });

    expect(res.id).toBe(gearId);
    expect(res.pricePerDay).toBe(80000);
    expect(res.pickupLocation.coordinates[0]).toBeCloseTo(105.791, 2);
  });

  it('2. enforces FREE_LOAN price = 0 and RENT price > 0 rules', async () => {
    await expect(
      gearService.createGear(ownerId, {
        categoryCode: 'TENT',
        title: 'Lều cho mượn nhưng đặt giá > 0',
        description: 'Mô tả',
        condition: GearCondition.GOOD,
        sharingType: GearListingType.FREE_LOAN,
        pricePerDay: 50000,
        depositAmount: 200000,
        city: 'Hà Nội',
        district: 'Cầu Giấy',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      gearService.createGear(ownerId, {
        categoryCode: 'TENT',
        title: 'Lều cho thuê nhưng giá = 0',
        description: 'Mô tả',
        condition: GearCondition.GOOD,
        sharingType: GearListingType.RENT,
        pricePerDay: 0,
        depositAmount: 200000,
        city: 'Hà Nội',
        district: 'Cầu Giấy',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. forbids a user from editing another user gear item', async () => {
    mockGearModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(gearId),
      ownerId: new Types.ObjectId(ownerId),
      title: 'Lều của Quân',
      sharingType: GearListingType.RENT,
      pricePerDay: 80000,
      depositAmount: 400000,
    });

    await expect(
      gearService.updateGear(otherUserId, UserRole.USER, gearId, {
        title: 'Cố tình sửa thiết bị của người khác',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('4. allows Admin to create and update gear categories', async () => {
    mockCategoryModel.findOne.mockResolvedValue(null);
    mockCategoryModel.create.mockResolvedValue({
      toObject: () => ({
        _id: new Types.ObjectId(categoryId),
        code: 'SLEEPING_PAD',
        name: 'Đệm hơi dã ngoại',
        slug: 'sleeping-pad',
        description: 'Đệm hơi cách nhiệt R-value cao',
        icon: 'Moon',
        parentCategoryId: null,
        attributesSchema: [],
        isActive: true,
        sortOrder: 12,
      }),
    });

    const cat = await gearService.createCategory({
      code: 'sleeping_pad',
      name: 'Đệm hơi dã ngoại',
      description: 'Đệm hơi cách nhiệt R-value cao',
    });

    expect(cat.code).toBe('SLEEPING_PAD');
    expect(cat.isActive).toBe(true);
  });

  it('5. excludes PAUSED and DRAFT gear from public marketplace search and computes distanceKm', async () => {
    mockGearModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(gearId),
          ownerId: new Types.ObjectId(ownerId),
          categoryCode: 'TENT',
          title: 'Lều đang ACTIVE tại Cầu Giấy',
          description: 'Mô tả',
          condition: GearCondition.GOOD,
          sharingType: GearListingType.RENT,
          pricePerDay: 80000,
          depositAmount: 300000,
          totalQuantity: 1,
          city: 'Hà Nội',
          district: 'Cầu Giấy',
          pickupLocation: {
            type: 'Point',
            coordinates: [105.7906, 21.0362],
          },
          status: GearStatus.ACTIVE,
          moderationStatus: GearModerationStatus.APPROVED,
          createdAt: new Date(),
        },
      ]),
    });

    const result = await gearService.searchGear({
      categoryCode: 'TENT',
      minPrice: 50000,
      maxPrice: 150000,
      sharingType: GearListingType.RENT,
      lng: 105.8342,
      lat: 21.0278,
      radiusKm: 20,
      sortBy: 'distance',
    });

    // Verify filter passed to MongoDB strictly requires status: ACTIVE
    const passedFilter = mockGearModel.find.mock.calls[0][0];
    expect(JSON.stringify(passedFilter)).toContain('"status":"ACTIVE"');
    expect(result.items.length).toBe(1);
    expect(result.items[0].distanceKm).toBeGreaterThan(0);
    expect(result.items[0].distanceKm).toBeLessThan(10);
  });

  it('6. hides DRAFT gear items from non-owners in getGearById', async () => {
    mockGearModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(gearId),
        ownerId: new Types.ObjectId(ownerId),
        status: GearStatus.DRAFT,
        moderationStatus: GearModerationStatus.APPROVED,
      }),
    });

    await expect(
      gearService.getGearById(gearId, otherUserId, UserRole.USER),
    ).rejects.toThrow(NotFoundException);
  });

  it('7. rejects invalid interval [startAt, endAt) where startAt >= endAt and detects overlap', async () => {
    expect(() =>
      availabilityService.parseAndValidateInterval(
        '2026-11-25T00:00:00.000Z',
        '2026-11-20T00:00:00.000Z',
      ),
    ).toThrow(BadRequestException);

    mockGearModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(gearId),
        ownerId: new Types.ObjectId(ownerId),
        totalQuantity: 1,
        pricePerDay: 80000,
        depositAmount: 400000,
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
      }),
    });

    mockAvailabilityModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            gearId: new Types.ObjectId(gearId),
            startAt: new Date('2026-11-20T00:00:00.000Z'),
            endAt: new Date('2026-11-23T00:00:00.000Z'),
            reservedQuantity: 1,
            reason: 'OWNER_BLOCKED',
            note: 'Chủ đồ tự dùng',
          },
        ]),
      }),
    });

    const overlapCheck = await availabilityService.getGearAvailability(gearId, {
      startAt: '2026-11-21T00:00:00.000Z',
      endAt: '2026-11-22T00:00:00.000Z',
      quantity: 1,
    });

    expect(overlapCheck.isAvailable).toBe(false);
    expect(overlapCheck.availableQuantity).toBe(0);
    expect(overlapCheck.conflictingPeriods.length).toBe(1);

    // Non-overlapping interval [2026-11-23, 2026-11-25) should be available per half-open [startAt, endAt) rule!
    const adjacentCheck = await availabilityService.getGearAvailability(gearId, {
      startAt: '2026-11-23T00:00:00.000Z',
      endAt: '2026-11-25T00:00:00.000Z',
      quantity: 1,
    });
    expect(adjacentCheck.isAvailable).toBe(true);
    expect(adjacentCheck.availableQuantity).toBe(1);
  });
});
