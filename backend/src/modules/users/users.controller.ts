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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Users & Profiles')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('me/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy hồ sơ cá nhân của người dùng đang đăng nhập' })
  async getMyProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.getProfileByUserId(user.userId);
  }

  @Patch('me/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân, avatar, cover' })
  async updateMyProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.userId, dto);
  }

  @Public()
  @Get('suggested')
  @ApiOperation({ summary: 'Danh sách gợi ý người dùng nên theo dõi' })
  async getSuggestedUsers(@CurrentUser() user?: RequestUser | null) {
    return this.usersService.getSuggestedUsers(user?.userId);
  }

  @Post(':targetUserId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Theo dõi (Follow) người dùng khác' })
  async followUser(
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.followUser(user.userId, targetUserId);
  }

  @Delete(':targetUserId/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ theo dõi (Unfollow) người dùng' })
  async unfollowUser(
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.unfollowUser(user.userId, targetUserId);
  }

  @Public()
  @Get(':targetUserId/followers')
  @ApiOperation({ summary: 'Lấy danh sách người theo dõi (Followers)' })
  async getFollowers(
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.usersService.getFollowers(targetUserId, user?.userId);
  }

  @Public()
  @Get(':targetUserId/following')
  @ApiOperation({ summary: 'Lấy danh sách đang theo dõi (Following)' })
  async getFollowing(
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.usersService.getFollowing(targetUserId, user?.userId);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Lấy danh sách đánh giá uy tín (Reviews) của người dùng',
  })
  async getUserReviews(@Param('id') id: string) {
    return this.usersService.getUserReviews(id);
  }

  @Public()
  @Get(':identifier')
  @ApiOperation({ summary: 'Xem hồ sơ công khai theo userId hoặc username' })
  async getPublicProfile(
    @Param('identifier') identifier: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.usersService.getPublicProfile(identifier, user?.userId);
  }
}
