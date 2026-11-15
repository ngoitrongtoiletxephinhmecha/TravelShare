import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ExperienceLevel } from '../../../common/enums/system.enums';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Quang Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Đam mê trekking Tây Bắc và camping cuối tuần.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: 'Hà Nội, Việt Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ enum: ExperienceLevel })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ type: [String], example: ['TREKKING', 'CAMPING'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteActivities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;
}
