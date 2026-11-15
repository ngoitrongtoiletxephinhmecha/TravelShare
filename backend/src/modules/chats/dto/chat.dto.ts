import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenConversationDto {
  @ApiProperty({ example: '6736c8e00000000000000002' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn người nhận tin nhắn (targetUserId)' })
  targetUserId: string;

  @ApiPropertyOptional({ example: '6736c8e00000000000000010' })
  @IsOptional()
  @IsString()
  gearId?: string;

  @ApiPropertyOptional({ example: '6736c8e00000000000000020' })
  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Chào bạn, chiều nay 18h mình ghé nhận lều nhé!' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  @MaxLength(4000)
  content: string;

  @ApiProperty({
    example: 'client-msg-1731648000000-abc123',
    description:
      'Khóa định danh tin nhắn từ phía client để chống lưu trùng khi retry mạng',
  })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu clientMessageId để đảm bảo idempotency' })
  @MaxLength(120)
  clientMessageId: string;

  @ApiPropertyOptional({ example: '6736c8e00000000000000010' })
  @IsOptional()
  @IsString()
  gearId?: string;

  @ApiPropertyOptional({ example: '6736c8e00000000000000020' })
  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class GetMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor phân trang lùi: lấy các tin nhắn cũ hơn beforeId',
  })
  @IsOptional()
  @IsString()
  beforeId?: string;

  @ApiPropertyOptional({
    description:
      'Cursor đồng bộ khi kết nối lại: lấy các tin nhắn mới hơn afterId',
  })
  @IsOptional()
  @IsString()
  afterId?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MarkConversationReadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastReadMessageId?: string;
}
