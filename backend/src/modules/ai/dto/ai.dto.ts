import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAiConversationDto {
  @ApiPropertyOptional({
    description: 'Tiêu đề cuộc hội thoại tư vấn AI',
    example: 'Chuẩn bị trekking Yên Tử',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    description: 'Tin nhắn mở đầu (tùy chọn)',
    example: 'Tôi muốn trekking Yên Tử',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  initialMessage?: string;

  @ApiPropertyOptional({
    description: 'Khóa chống gửi trùng từ client cho tin nhắn mở đầu',
    example: 'ai-cmsg-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientMessageId?: string;
}

export class SendAiMessageDto {
  @ApiPropertyOptional({
    description: 'Nội dung tin nhắn tiếng Việt gửi tới AI Travel Assistant',
    example: 'Tôi muốn trekking Yên Tử',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({
    description: 'Biệt danh tương thích cho trường content',
    example: 'Đi một ngày, nhóm ba người',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({
    description:
      'Khóa idempotency từ client để khi retry mạng không tạo bản ghi trùng',
    example: 'ai-cmsg-turn-1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientMessageId?: string;

  @ApiPropertyOptional({
    description: 'Tùy chọn giả lập lỗi Gemini phục vụ kiểm thử khả năng phục hồi',
    enum: ['TIMEOUT', 'QUOTA_EXCEEDED', 'INVALID_SCHEMA', 'NOT_FOUND'],
  })
  @IsOptional()
  @IsIn(['TIMEOUT', 'QUOTA_EXCEEDED', 'INVALID_SCHEMA', 'NOT_FOUND'])
  simulateError?: 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'INVALID_SCHEMA' | 'NOT_FOUND';
}

export class GetAiMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor phân trang: lấy tin nhắn trước messageId này',
  })
  @IsOptional()
  @IsString()
  beforeId?: string;

  @ApiPropertyOptional({
    description: 'Số lượng tin nhắn tối đa mỗi trang',
    default: 40,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
