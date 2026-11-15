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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { ChecklistsService } from './checklists.service';
import {
  AddChecklistItemDto,
  MatchChecklistGearDto,
  UpdateChecklistItemDto,
} from './dto/checklist.dto';

@ApiTags('Checklist Generator & Gear Matching (Phase 7)')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post('travel-plans/:id/checklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tạo hoặc lấy checklist hiện tại cho một TravelPlan (bảo toàn số lượng đã có khi kế hoạch thay đổi)',
  })
  async createOrGetChecklistForPlan(
    @Param('id') travelPlanId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.checklistsService.generateOrGetChecklistForPlan(
      user.userId,
      travelPlanId,
    );
  }

  @Get('checklists/:id')
  @ApiOperation({
    summary: 'Lấy chi tiết checklist theo ID kèm số lượng thiếu từng hạng mục',
  })
  async getChecklistById(
    @Param('id') checklistId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.checklistsService.getChecklistById(user.userId, checklistId);
  }

  @Patch('checklists/:id/items/:itemId')
  @ApiOperation({
    summary:
      'Cập nhật số lượng đồ đã có (quantityOwned), số lượng cần chuẩn bị (quantityRequired), xác nhận đồ đã có hoặc kích cỡ yêu cầu',
  })
  async updateChecklistItem(
    @Param('id') checklistId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.checklistsService.updateChecklistItem(
      user.userId,
      checklistId,
      itemId,
      dto,
    );
  }

  @Post('checklists/:id/items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thêm hạng mục mới vào checklist (dùng chung engine cập nhật với Chat)',
  })
  async addChecklistItem(
    @Param('id') checklistId: string,
    @Body() dto: AddChecklistItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.checklistsService.addChecklistItem(
      user.userId,
      checklistId,
      dto,
    );
  }

  @Delete('checklists/:id/items/:itemId')
  @ApiOperation({
    summary: 'Bỏ một hạng mục khỏi checklist đang dùng và loại khỏi kết quả tìm đồ',
  })
  async removeChecklistItem(
    @Param('id') checklistId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
    @Query('expectedChecklistVersion') expectedChecklistVersion?: string,
  ) {
    const parsedVersion = expectedChecklistVersion
      ? parseInt(expectedChecklistVersion, 10)
      : undefined;
    return this.checklistsService.removeChecklistItem(
      user.userId,
      checklistId,
      itemId,
      parsedVersion && !Number.isNaN(parsedVersion) ? parsedVersion : undefined,
    );
  }

  @Post('checklists/:id/matches')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tìm thiết bị cho thuê/mượn còn thiếu theo lịch [startAt, endAt), khu vực nhận đồ, thuộc tính và ngân sách',
  })
  async matchMissingGear(
    @Param('id') checklistId: string,
    @Body() dto: MatchChecklistGearDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.checklistsService.matchMissingGear(
      user.userId,
      checklistId,
      dto,
    );
  }
}
