import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BookingStatus,
  DisputeReason,
  DisputeStatus,
  GearCondition,
  GearListingType,
} from '../../../common/enums/system.enums';

export class CreateBookingDto {
  @ApiProperty({ example: '6736c8e00000000000000001' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn thiết bị cần thuê/mượn' })
  gearId: string;

  @ApiProperty({ example: '2026-12-01T00:00:00.000Z' })
  @IsDateString({}, { message: 'Thời gian bắt đầu (startAt) phải là ISO 8601' })
  startAt: string;

  @ApiProperty({ example: '2026-12-03T00:00:00.000Z' })
  @IsDateString({}, { message: 'Thời gian kết thúc (endAt) phải là ISO 8601' })
  endAt: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Số lượng thiết bị tối thiểu là 1' })
  @Max(50)
  quantity?: number;

  @ApiPropertyOptional({
    example: 'Mình đi cung Lảo Thẩn cuối tuần, cam kết giữ vệ sinh lều sạch sẽ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  renterNote?: string;

  @ApiPropertyOptional({
    description: 'Giá thuê/ngày snapshot từ bước matching để phát hiện thay đổi giá',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedPricePerDay?: number;

  @ApiPropertyOptional({
    description: 'Tiền cọc/chiếc snapshot từ bước matching để phát hiện thay đổi cọc',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedDepositAmount?: number;

  @ApiPropertyOptional({
    enum: GearListingType,
    description: 'Hình thức chia sẻ snapshot từ bước matching',
  })
  @IsOptional()
  @IsEnum(GearListingType)
  expectedSharingType?: GearListingType;
}

export class ApproveBookingDto {
  @ApiPropertyOptional({
    example: 'Đã duyệt! Bạn ghé nhận đồ tại Quận 1 sau 18h nhé.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú nội bộ chỉ chủ thiết bị và Admin được phép xem',
    example: 'Kiểm tra lại dây kéo trước khi giao khách',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class RejectBookingDto {
  @ApiPropertyOptional({
    example: 'Đợt này mình bận công tác đột xuất chưa kịp giao đồ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CancelBookingDto {
  @ApiProperty({
    example: 'Đoàn hoãn lịch leo núi do mưa bão tại Lào Cai.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do hủy giao dịch' })
  @MaxLength(1000)
  reason: string;
}

export class SubmitHandoverDto {
  @ApiPropertyOptional({
    type: [String],
    example: [
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=900&q=80',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ enum: GearCondition, default: GearCondition.GOOD })
  @IsOptional()
  @IsEnum(GearCondition)
  condition?: GearCondition;

  @ApiPropertyOptional({
    example: 'Đầy đủ khung nhôm, cọc lều 12 chiếc, vải chống nước nguyên vẹn.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;
}

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Điểm đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Điểm đánh giá tối đa là 5 sao' })
  rating: number;

  @ApiProperty({
    example: 'Thiết bị rất mới, chủ đồ nhiệt tình hướng dẫn cách dựng lều!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập nội dung đánh giá' })
  @MaxLength(1500)
  comment: string;
}

export class CreateDisputeDto {
  @ApiProperty({ enum: DisputeReason, example: DisputeReason.DAMAGED_GEAR })
  @IsEnum(DisputeReason, { message: 'Lý do tranh chấp không hợp lệ' })
  reason: DisputeReason;

  @ApiProperty({
    example: 'Khi nhận lại thiết bị phát hiện gãy 1 đốt khung nhôm chính.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng mô tả chi tiết sự việc cần khiếu nại' })
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}

export class ResolveDisputeDto {
  @ApiProperty({
    enum: DisputeStatus,
    example: DisputeStatus.RESOLVED_FOR_OWNER,
  })
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @ApiProperty({
    example:
      'Đã đối chiếu ảnh Handover lúc nhận và trả, xác nhận người thuê cần hỗ trợ chi phí thay đốt khung nhôm.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Admin cần nhập ghi chú quyết định xử lý tranh chấp' })
  @MaxLength(2000)
  adminNotes: string;
}

export class ListBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
