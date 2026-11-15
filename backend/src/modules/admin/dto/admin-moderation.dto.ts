import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AccountStatus,
  DisputeStatus,
  ReportStatus,
  ReportTargetType,
} from '../../../common/enums/system.enums';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ description: 'ID của đối tượng bị báo cáo' })
  @IsString()
  @IsNotEmpty({ message: 'targetId là bắt buộc' })
  targetId: string;

  @ApiProperty({ example: 'Nội dung spam hoặc thông tin sai lệch' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn hoặc nhập lý do báo cáo' })
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ example: 'Bài viết chứa liên kết quảng cáo không liên quan đến du lịch.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class QueryReportsDto {
  @ApiPropertyOptional({ enum: ReportTargetType })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu (ISO date)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (ISO date)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class HandleReportDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiPropertyOptional({
    enum: ['NONE', 'HIDE_CONTENT', 'RESTORE_CONTENT', 'SUSPEND_USER'],
    default: 'NONE',
  })
  @IsOptional()
  @IsString()
  action?: 'NONE' | 'HIDE_CONTENT' | 'RESTORE_CONTENT' | 'SUSPEND_USER';

  @ApiPropertyOptional({ description: 'Lý do/kết quả công khai gửi cho người báo cáo' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicOutcome?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ chỉ dành cho quản trị viên/moderator' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

export class UpdateUserAccountStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status: AccountStatus;

  @ApiProperty({ example: 'Tài khoản vi phạm nhiều lần chính sách cộng đồng' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do thay đổi trạng thái tài khoản' })
  @MaxLength(500)
  reason: string;
}

export class AdminModerateContentDto {
  @ApiProperty({ enum: ['HIDE', 'RESTORE'] })
  @IsString()
  @IsNotEmpty()
  action: 'HIDE' | 'RESTORE';

  @ApiProperty({ example: 'Nội dung vi phạm quy định an toàn của nền tảng' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do kiểm duyệt' })
  @MaxLength(500)
  reason: string;
}

export class AdminResolveDisputeDto {
  @ApiProperty({ enum: DisputeStatus })
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @ApiProperty({ example: 'Đã đối chiếu ảnh bàn giao và hoàn tất xử lý cho hai bên' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập ghi chú xử lý tranh chấp' })
  @MaxLength(2000)
  adminNotes: string;
}
