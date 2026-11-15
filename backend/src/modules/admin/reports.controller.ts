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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import {
  CreateReportDto,
  HandleReportDto,
  QueryReportsDto,
} from './dto/admin-moderation.dto';

@ApiTags('Reports & Moderation (Phase 8)')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi báo cáo vi phạm (bài viết, bình luận, thiết bị, người dùng, giao dịch)' })
  async createReport(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.createReport(user.userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Xem danh sách báo cáo tôi đã gửi và trạng thái xử lý' })
  async listMyReports(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reportsService.listMyReports(user.userId, page, limit);
  }

  @Get('moderation')
  @ApiOperation({
    summary:
      'Hàng đợi báo cáo kiểm duyệt (Moderator xem bài/bình luận trong nhóm của mình; Admin xem toàn hệ thống)',
  })
  async listModerationReports(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryReportsDto,
  ) {
    return this.reportsService.listModerationReports(
      user.userId,
      user.role,
      query,
    );
  }

  @Patch(':id/handle')
  @ApiOperation({
    summary:
      'Cập nhật trạng thái và xử lý báo cáo (PENDING -> IN_REVIEW -> RESOLVED / DISMISSED)',
  })
  async handleReport(
    @Param('id') reportId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: HandleReportDto,
  ) {
    return this.reportsService.handleReport(
      reportId,
      user.userId,
      user.role,
      dto,
    );
  }
}
