import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ActivityType, CommunityRole } from '../../../common/enums/system.enums';

export class QueryCommunitiesDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc mô tả cộng đồng' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc các cộng đồng đã tham gia' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  joinedOnly?: boolean;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

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
  @Max(50)
  limit?: number = 12;
}

export class CreateCommunityDto {
  @ApiProperty({ example: 'Trekking Miền Bắc' })
  @IsString()
  @IsNotEmpty({ message: 'Tên cộng đồng không được để trống' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Nơi chia sẻ kinh nghiệm leo núi, săn mây và ghép đoàn miền Bắc.' })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả cộng đồng không được để trống' })
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ enum: ActivityType, default: ActivityType.TREKKING })
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateCommunityRulesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  rules: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AssignCommunityRoleDto {
  @ApiProperty({ enum: [CommunityRole.MODERATOR, CommunityRole.MEMBER] })
  @IsEnum(CommunityRole)
  role: CommunityRole;
}

export class TransferOwnershipDto {
  @ApiProperty({ description: 'User ID của thành viên sẽ nhận quyền OWNER' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn thành viên nhận quyền sở hữu' })
  newOwnerId: string;
}

export class CommunityModerateContentDto {
  @ApiProperty({ enum: ['HIDE', 'RESTORE'] })
  @IsString()
  @IsNotEmpty()
  action: 'HIDE' | 'RESTORE';

  @ApiProperty({ example: 'Vi phạm nội quy cộng đồng: spam quảng cáo' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do kiểm duyệt' })
  @MaxLength(500)
  reason: string;
}
