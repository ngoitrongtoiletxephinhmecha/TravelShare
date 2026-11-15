import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { AccountStatus, UserRole } from '../../common/enums/system.enums';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import {
  AdminModerateContentDto,
  AdminResolveDisputeDto,
  UpdateUserAccountStatusDto,
} from './dto/admin-moderation.dto';

@ApiTags('Admin & Content Moderation (Phase 8)')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Thống kê tổng quan hệ thống (chỉ ADMIN)' })
  async getOverview() {
    return this.adminService.getOverview();
  }

  @Get('users')
  @ApiOperation({ summary: 'Danh sách & tìm kiếm tài khoản người dùng (chỉ ADMIN)' })
  async listUsers(
    @Query('q') q?: string,
    @Query('status') status?: AccountStatus,
    @Query('role') role?: UserRole,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listUsers({ q, status, role, page, limit });
  }

  @Patch('users/:userId/status')
  @ApiOperation({ summary: 'Khóa, tạm ngưng hoặc mở khóa tài khoản người dùng (chỉ ADMIN)' })
  async updateUserStatus(
    @Param('userId') userId: string,
    @CurrentUser() admin: RequestUser,
    @Body() dto: UpdateUserAccountStatusDto,
  ) {
    return this.adminService.updateUserAccountStatus(admin.userId, userId, dto);
  }

  @Get('content')
  @ApiOperation({ summary: 'Tìm kiếm bài viết, bình luận và thiết bị để kiểm duyệt (chỉ ADMIN)' })
  async listContent(
    @Query('type') type?: 'POST' | 'COMMENT' | 'GEAR',
    @Query('q') q?: string,
    @Query('visibility') visibility?: 'ALL' | 'ACTIVE' | 'HIDDEN',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listContentForModeration({
      type,
      q,
      visibility,
      page,
      limit,
    });
  }

  @Patch('content/:targetType/:targetId')
  @ApiOperation({ summary: 'Ẩn hoặc khôi phục bài viết, bình luận, tin thiết bị (chỉ ADMIN)' })
  async moderateContent(
    @Param('targetType') targetType: 'POST' | 'COMMENT' | 'GEAR',
    @Param('targetId') targetId: string,
    @CurrentUser() admin: RequestUser,
    @Body() dto: AdminModerateContentDto,
  ) {
    return this.adminService.moderateContent(
      admin.userId,
      targetType,
      targetId,
      dto,
    );
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Danh sách tranh chấp booking toàn hệ thống (chỉ ADMIN)' })
  async listDisputes() {
    return this.adminService.listDisputes();
  }

  @Patch('disputes/:id')
  @ApiOperation({ summary: 'Cập nhật kết quả xử lý tranh chấp booking (chỉ ADMIN)' })
  async resolveDispute(
    @Param('id') disputeId: string,
    @CurrentUser() admin: RequestUser,
    @Body() dto: AdminResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(disputeId, admin.userId, dto);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Nhật ký thao tác kiểm duyệt hệ thống (chỉ ADMIN)' })
  async listAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.listAuditLogs(page, limit);
  }
}
