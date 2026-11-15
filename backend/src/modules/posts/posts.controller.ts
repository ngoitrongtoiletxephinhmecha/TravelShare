import {
  Body,
  Controller,
  Delete,
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
import { PostsService } from './posts.service';
import {
  CreateCommentDto,
  CreatePostDto,
  QueryPostsDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './dto/post.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Posts & Social Interactions')
@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách bài viết (Cursor pagination, News Feed, Explore, Profile)',
  })
  async getFeed(
    @Query() query: QueryPostsDto,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.postsService.getPostsFeed(query, user?.userId);
  }

  @Public()
  @Get('hashtags/trending')
  @ApiOperation({ summary: 'Lấy danh sách hashtag xu hướng kèm số lượng bài viết' })
  async getTrendingHashtags() {
    return this.postsService.getTrendingHashtags();
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bài viết du lịch mới (hỗ trợ nhiều ảnh/video, địa điểm, hashtag)' })
  async createPost(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(user.userId, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một bài viết' })
  async getPostById(
    @Param('id') id: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.postsService.getPostById(id, user?.userId, user?.role);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉnh sửa bài viết (chỉ tác giả hoặc Admin)' })
  async updatePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(user.userId, user.role, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bài viết (chỉ tác giả hoặc Admin)' })
  async deletePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.deletePost(user.userId, user.role, id);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like bài viết (ngăn trùng lặp bằng unique compound index)' })
  async likePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.likePost(user.userId, id);
  }

  @Delete(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ like bài viết' })
  async unlikePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.unlikePost(user.userId, id);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lưu bài viết vào danh sách đã lưu' })
  async savePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.savePost(user.userId, id);
  }

  @Delete(':id/save')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ lưu bài viết' })
  async unsavePost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.unsavePost(user.userId, id);
  }

  @Public()
  @Get(':id/comments')
  @ApiOperation({ summary: 'Lấy danh sách bình luận và phản hồi của bài viết' })
  async getComments(@Param('id') id: string) {
    return this.postsService.getPostComments(id);
  }

  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm bình luận hoặc trả lời bình luận (reply)' })
  async createComment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.createComment(user.userId, id, dto);
  }

  @Patch('comments/:commentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉnh sửa bình luận (chỉ chủ sở hữu bình luận)' })
  async updateComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.postsService.updateComment(user.userId, commentId, dto);
  }

  @Delete('comments/:commentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bình luận (chủ bình luận, chủ bài viết hoặc Admin)' })
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postsService.deleteComment(user.userId, user.role, commentId);
  }
}
