import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GearService } from './gear.service';
import { AvailabilityService } from './availability.service';
import {
  CheckAvailabilityQueryDto,
  CreateGearCategoryDto,
  CreateGearDto,
  CreateUnavailablePeriodDto,
  ModerateGearDto,
  SearchGearQueryDto,
  UpdateGearCategoryDto,
  UpdateGearDto,
  UpdateGearStatusDto,
} from './dto/gear.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { GearStatus, UserRole } from '../../common/enums/system.enums';

@ApiTags('Gear Marketplace')
@Controller('gear')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GearController {
  constructor(
    private readonly gearService: GearService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  // ==========================================
  // CATEGORIES
  // ==========================================

  @Public()
  @Get('categories')
  @ApiOperation({
    summary: 'Lấy danh sách danh mục thiết bị du lịch (kèm attributesSchema)',
  })
  async getCategories(@Query('includeInactive') includeInactive?: string) {
    return this.gearService.getCategories(includeInactive === 'true');
  }

  @Post('categories')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo danh mục thiết bị mới (Chỉ Admin)' })
  async createCategory(@Body() dto: CreateGearCategoryDto) {
    return this.gearService.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hoặc ẩn danh mục thiết bị (Chỉ Admin)' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateGearCategoryDto,
  ) {
    return this.gearService.updateCategory(id, dto);
  }

  // ==========================================
  // GEAR ITEMS & MARKETPLACE SEARCH
  // ==========================================

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Tìm kiếm và lọc thiết bị trên Marketplace (category, giá, bán kính 2dsphere, khoảng ngày trống)',
  })
  async searchGear(@Query() query: SearchGearQueryDto) {
    return this.gearService.searchGear(query);
  }

  @Get('my-items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách thiết bị của tôi (/my-gear)' })
  async getMyGearItems(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: GearStatus,
  ) {
    return this.gearService.getMyGearItems(user.userId, status);
  }

  @Public()
  @Get('owner/:ownerIdentifier')
  @ApiOperation({
    summary: 'Lấy danh sách thiết bị công khai của một thành viên (trên trang Profile)',
  })
  async getPublicGearByOwner(
    @Param('ownerIdentifier') ownerIdentifier: string,
  ) {
    return this.gearService.getPublicGearByOwner(ownerIdentifier);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Xem chi tiết thiết bị, lịch khả dụng và thiết bị tương tự',
  })
  async getGearById(
    @Param('id') id: string,
    @CurrentUser() user?: RequestUser | null,
  ) {
    return this.gearService.getGearById(id, user?.userId, user?.role);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng thiết bị mới (ACTIVE hoặc lưu nháp DRAFT)' })
  async createGear(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateGearDto,
  ) {
    return this.gearService.createGear(user.userId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉnh sửa thông tin thiết bị (Chủ sở hữu hoặc Admin)' })
  async updateGear(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateGearDto,
  ) {
    return this.gearService.updateGear(user.userId, user.role, id, dto);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Đổi trạng thái thiết bị: DRAFT, ACTIVE, PAUSED, UNAVAILABLE, ARCHIVED',
  })
  async updateGearStatus(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateGearStatusDto,
  ) {
    return this.gearService.updateGearStatus(user.userId, user.role, id, dto);
  }

  @Patch(':id/moderation')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm duyệt thiết bị (Chỉ Admin)' })
  async moderateGear(
    @Param('id') id: string,
    @Body() dto: ModerateGearDto,
  ) {
    return this.gearService.moderateGear(id, dto);
  }

  // ==========================================
  // AVAILABILITY MANAGEMENT [startAt, endAt)
  // ==========================================

  @Public()
  @Get(':id/availability')
  @ApiOperation({
    summary:
      'Xem lịch khả dụng và kiểm tra thiết bị còn trống trong khoảng [startAt, endAt)',
  })
  async getAvailability(
    @Param('id') id: string,
    @Query() query: CheckAvailabilityQueryDto,
  ) {
    return this.availabilityService.getGearAvailability(id, query);
  }

  @Post(':id/unavailable-periods')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chủ thiết bị khai báo khoảng ngày không cho thuê [startAt, endAt)',
  })
  async addUnavailablePeriod(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateUnavailablePeriodDto,
  ) {
    return this.availabilityService.addUnavailablePeriod(
      user.userId,
      user.role,
      id,
      dto,
    );
  }

  @Delete(':id/unavailable-periods/:periodId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa khoảng thời gian khóa lịch thủ công' })
  async removeUnavailablePeriod(
    @Param('id') id: string,
    @Param('periodId') periodId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.availabilityService.removeUnavailablePeriod(
      user.userId,
      user.role,
      id,
      periodId,
    );
  }
}
