import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { CommunitiesService } from './communities.service';
import {
  AssignCommunityRoleDto,
  CommunityModerateContentDto,
  CreateCommunityDto,
  QueryCommunitiesDto,
  TransferOwnershipDto,
  UpdateCommunityRulesDto,
} from './dto/community.dto';
import { QueryPostsDto } from '../posts/dto/post.dto';

@ApiTags('Communities (Phase 8)')
@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Danh sách cộng đồng du lịch (tìm kiếm, phân trang, lọc đã tham gia)' })
  async listCommunities(
    @Query() query: QueryCommunitiesDto,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.communitiesService.listCommunities(query, user?.userId);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo cộng đồng du lịch mới (người tạo là OWNER)' })
  async createCommunity(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCommunityDto,
  ) {
    return this.communitiesService.createCommunity(user.userId, dto);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Chi tiết cộng đồng du lịch theo slug hoặc ID' })
  async getCommunityBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.communitiesService.getCommunityBySlug(slug, user?.userId);
  }

  @Public()
  @Get(':slug/posts')
  @ApiOperation({ summary: 'Danh sách bài viết công khai trong cộng đồng' })
  async getCommunityPosts(
    @Param('slug') slug: string,
    @Query() query: QueryPostsDto,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.communitiesService.getCommunityPosts(slug, query, user?.userId);
  }

  @Public()
  @Get(':slug/members')
  @ApiOperation({ summary: 'Danh sách thành viên của cộng đồng' })
  async listMembers(
    @Param('slug') slug: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communitiesService.listMembers(slug, page, limit);
  }

  @Post(':slug/join')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia cộng đồng (idempotent)' })
  async joinCommunity(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.communitiesService.joinCommunity(user.userId, slug);
  }

  @Post(':slug/leave')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rời cộng đồng (OWNER phải chuyển quyền trước)' })
  async leaveCommunity(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.communitiesService.leaveCommunity(user.userId, slug);
  }

  @Patch(':slug/rules')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật nội quy cộng đồng (OWNER)' })
  async updateRules(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateCommunityRulesDto,
  ) {
    return this.communitiesService.updateRules(
      user.userId,
      user.role,
      slug,
      dto,
    );
  }

  @Patch(':slug/members/:memberUserId/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bổ nhiệm hoặc gỡ Moderator trong cộng đồng (OWNER)' })
  async assignRole(
    @Param('slug') slug: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignCommunityRoleDto,
  ) {
    return this.communitiesService.assignMemberRole(
      user.userId,
      user.role,
      slug,
      memberUserId,
      dto,
    );
  }

  @Post(':slug/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chuyển quyền sở hữu cộng đồng sang thành viên khác' })
  async transferOwnership(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.communitiesService.transferOwnership(
      user.userId,
      user.role,
      slug,
      dto,
    );
  }

  @Patch(':slug/posts/:postId/moderate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ẩn hoặc khôi phục bài viết trong cộng đồng (OWNER / MODERATOR của nhóm)' })
  async moderatePost(
    @Param('slug') slug: string,
    @Param('postId') postId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CommunityModerateContentDto,
  ) {
    return this.communitiesService.moderateCommunityPost(
      user.userId,
      user.role,
      slug,
      postId,
      dto,
    );
  }

  @Patch(':slug/comments/:commentId/moderate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ẩn hoặc khôi phục bình luận trong cộng đồng (OWNER / MODERATOR của nhóm)' })
  async moderateComment(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CommunityModerateContentDto,
  ) {
    return this.communitiesService.moderateCommunityComment(
      user.userId,
      user.role,
      slug,
      commentId,
      dto,
    );
  }
}
