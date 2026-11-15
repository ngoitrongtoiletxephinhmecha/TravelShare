import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
} from '../../../common/enums/system.enums';
import { CategoryAttributeField } from '../../../database/schemas';

export class CreateGearCategoryDto {
  @ApiProperty({ example: 'TENT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Lều trại' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Lều cắm trại 1-6 người, tăng bạt chống mưa' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'Tent' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'ID danh mục cha nếu là danh mục con' })
  @IsOptional()
  @IsString()
  parentCategoryId?: string | null;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  attributesSchema?: CategoryAttributeField[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateGearCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentCategoryId?: string | null;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  attributesSchema?: CategoryAttributeField[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class AvailabilitySettingsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minRentalDays?: number = 1;

  @ApiPropertyOptional({ default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRentalDays?: number = 14;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  advanceNoticeHours?: number = 4;
}

export class CreateGearDto {
  @ApiProperty({ example: 'TENT' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn danh mục thiết bị' })
  categoryCode: string;

  @ApiProperty({
    example: 'Lều Naturehike Cloud Up 2 (2 người, chống mưa PU4000mm)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên thiết bị không được để trống' })
  @MaxLength(160)
  title: string;

  @ApiProperty({
    example:
      'Lều 2 lớp siêu nhẹ 1.7kg, khung nhôm 7001 chịu gió tốt, phù hợp trekking Lảo Thẩn, Tà Xùa.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả thiết bị không được để trống' })
  @MaxLength(4000)
  description: string;

  @ApiPropertyOptional({ example: 'Naturehike' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiProperty({ enum: GearCondition, default: GearCondition.GOOD })
  @IsEnum(GearCondition)
  condition: GearCondition;

  @ApiPropertyOptional({
    example: { capacityPersons: 2, waterproofMm: 4000, weightKg: 1.7 },
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiProperty({ enum: GearListingType, default: GearListingType.RENT })
  @IsEnum(GearListingType)
  sharingType: GearListingType;

  @ApiProperty({ example: 80000, description: 'Giá thuê 1 ngày (VND)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Giá thuê không được âm' })
  pricePerDay: number;

  @ApiProperty({ example: 500000, description: 'Tiền cọc dự kiến (VND)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Tiền cọc không được âm' })
  depositAmount: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  totalQuantity?: number = 1;

  @ApiProperty({ example: 'Hà Nội' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn Tỉnh/Thành phố giao nhận' })
  city: string;

  @ApiProperty({ example: 'Cầu Giấy' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập Quận/Huyện khu vực nhận đồ' })
  district: string;

  @ApiPropertyOptional({
    description: 'Kinh độ (Longitude) của khu vực nhận đồ gần đúng',
    example: 105.7906,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Vĩ độ (Latitude) của khu vực nhận đồ gần đúng',
    example: 21.0362,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usageRules?: string[];

  @ApiPropertyOptional({ type: AvailabilitySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AvailabilitySettingsDto)
  availabilitySettings?: AvailabilitySettingsDto;

  @ApiPropertyOptional({
    enum: [GearStatus.DRAFT, GearStatus.ACTIVE],
    default: GearStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(GearStatus)
  status?: GearStatus;
}

export class UpdateGearDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional({ enum: GearCondition })
  @IsOptional()
  @IsEnum(GearCondition)
  condition?: GearCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ enum: GearListingType })
  @IsOptional()
  @IsEnum(GearListingType)
  sharingType?: GearListingType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Giá thuê không được âm' })
  pricePerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Tiền cọc không được âm' })
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  totalQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usageRules?: string[];

  @ApiPropertyOptional({ type: AvailabilitySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AvailabilitySettingsDto)
  availabilitySettings?: AvailabilitySettingsDto;

  @ApiPropertyOptional({ enum: GearStatus })
  @IsOptional()
  @IsEnum(GearStatus)
  status?: GearStatus;
}

export class UpdateGearStatusDto {
  @ApiProperty({ enum: GearStatus, example: GearStatus.PAUSED })
  @IsEnum(GearStatus)
  status: GearStatus;
}

export class ModerateGearDto {
  @ApiProperty({
    enum: GearModerationStatus,
    example: GearModerationStatus.APPROVED,
  })
  @IsEnum(GearModerationStatus)
  moderationStatus: GearModerationStatus;
}

export class SearchGearQueryDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm tên, mô tả, thương hiệu' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Mã danh mục (VD: TENT, BACKPACK)' })
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional({ enum: GearListingType })
  @IsOptional()
  @IsEnum(GearListingType)
  sharingType?: GearListingType;

  @ApiPropertyOptional({ enum: GearCondition })
  @IsOptional()
  @IsEnum(GearCondition)
  condition?: GearCondition;

  @ApiPropertyOptional({ description: 'Giá thuê tối thiểu (VND/ngày)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá thuê tối đa (VND/ngày)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Lọc theo Tỉnh/Thành phố' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Kinh độ (Longitude) để tìm theo bán kính' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ description: 'Vĩ độ (Latitude) để tìm theo bán kính' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Bán kính tìm kiếm (km)', default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu cần thuê [startAt, endAt)' })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc cần thuê [startAt, endAt)' })
  @IsOptional()
  @IsString()
  endAt?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'price_asc', 'price_desc', 'distance'],
    default: 'newest',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'distance' = 'newest';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number = 12;
}

export class CreateUnavailablePeriodDto {
  @ApiProperty({ example: '2026-11-20T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  startAt: string;

  @ApiProperty({ example: '2026-11-23T00:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  endAt: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reservedQuantity?: number = 1;

  @ApiPropertyOptional({ example: 'Chủ đồ tự sử dụng đi trekking Tà Xùa' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CheckAvailabilityQueryDto {
  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-11-22' })
  @IsOptional()
  @IsString()
  endAt?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number = 1;
}
