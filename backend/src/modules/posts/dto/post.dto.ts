import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityType } from '../../../common/enums/system.enums';

export class CreatePostDto {
  @ApiProperty({
    example:
      'Chinh phục đỉnh Lảo Thẩn 2.860m săn biển mây tuyệt đẹp! Nhiệt độ ban đêm khoảng 6 độ C. #LaoThan #TrekkingVietNam',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung bài viết không được để trống' })
  @MaxLength(5000, { message: 'Nội dung bài viết tối đa 5000 ký tự' })
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ type: [String], example: ['#LaoThan', '#TrekkingVietNam'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ example: 'Y Tý, Bát Xát, Lào Cai' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gearTags?: string[];

  @ApiPropertyOptional({ description: 'ID cộng đồng nếu đăng bài trong một nhóm' })
  @IsOptional()
  @IsString()
  communityId?: string;
}

export class UpdatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gearTags?: string[];

  @ApiPropertyOptional({ description: 'ID cộng đồng nếu đăng bài trong một nhóm' })
  @IsOptional()
  @IsString()
  communityId?: string;
}

export class QueryPostsDto {
  @ApiPropertyOptional({
    description: 'Cursor phân trang dạng ISO_DATE_OBJECTID',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: ['latest', 'following', 'featured', 'saved'],
    default: 'latest',
  })
  @IsOptional()
  @IsString()
  feedType?: 'latest' | 'following' | 'featured' | 'saved' = 'latest';

  @ApiPropertyOptional({ description: 'Lọc theo userId hoặc username tác giả' })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo hashtag (ví dụ: LaoThan)' })
  @IsOptional()
  @IsString()
  hashtag?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm nội dung hoặc địa điểm' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc bài viết thuộc một cộng đồng (communityId)' })
  @IsOptional()
  @IsString()
  communityId?: string;
}

export class CreateCommentDto {
  @ApiProperty({ example: 'Cung này đi tháng 11 có cần chuẩn bị đinh giày không bạn?' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung bình luận không được để trống' })
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'ID bình luận cha nếu là reply' })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({ example: 'Nội dung bình luận đã chỉnh sửa' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung bình luận không được để trống' })
  @MaxLength(2000)
  content: string;
}
