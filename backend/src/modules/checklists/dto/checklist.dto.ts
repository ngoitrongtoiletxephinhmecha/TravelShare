import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GearListingType } from '../../../common/enums/system.enums';

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsInt({ message: 'Số lượng cần chuẩn bị (quantityRequired) phải là số nguyên' })
  @Min(1, { message: 'Số lượng cần chuẩn bị (quantityRequired) phải lớn hơn hoặc bằng 1' })
  @Max(1000, { message: 'Số lượng cần chuẩn bị vượt quá giới hạn cho phép' })
  quantityRequired?: number;

  @IsOptional()
  @IsInt({ message: 'Số lượng đã có (quantityOwned) phải là số nguyên' })
  @Min(0, { message: 'Số lượng đã có (quantityOwned) không được nhỏ hơn 0' })
  @Max(1000, { message: 'Số lượng đã có vượt quá giới hạn cho phép' })
  quantityOwned?: number;

  @IsOptional()
  @IsBoolean()
  ownedConfirmed?: boolean;

  @IsOptional()
  @IsObject()
  requiredAttributes?: Record<string, any>;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedChecklistVersion?: number;
}

export class AddChecklistItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên hạng mục đồ cần thêm không được để trống' })
  name: string;

  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng cần chuẩn bị phải là số nguyên' })
  @Min(1)
  @Max(1000)
  quantityRequired?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng đã có phải là số nguyên' })
  @Min(0)
  @Max(1000)
  quantityOwned?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsBoolean()
  canRent?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedChecklistVersion?: number;
}

export class MatchChecklistGearDto {
  @IsString()
  @IsNotEmpty({ message: 'Ngày bắt đầu thuê (startAt) là bắt buộc' })
  startAt: string;

  @IsString()
  @IsNotEmpty({ message: 'Ngày trả đồ (endAt) là bắt buộc' })
  endAt: string;

  @IsOptional()
  @IsString()
  pickupArea?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(200)
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Ngân sách (budgetVnd) không được nhỏ hơn 0' })
  budgetVnd?: number | null;

  @IsOptional()
  @IsEnum(GearListingType)
  sharingType?: GearListingType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expectedChecklistVersion?: number;
}
