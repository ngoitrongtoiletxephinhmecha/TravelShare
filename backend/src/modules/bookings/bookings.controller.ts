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
import { Public } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import {
  ApproveBookingDto,
  CancelBookingDto,
  CreateBookingDto,
  CreateDisputeDto,
  CreateReviewDto,
  ListBookingsQueryDto,
  RejectBookingDto,
  ResolveDisputeDto,
  SubmitHandoverDto,
} from './dto/booking.dto';

@ApiTags('Bookings & Rental Management')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Tạo yêu cầu thuê/mượn thiết bị (PENDING) kèm kiểm tra lịch trống [startAt, endAt) và chụp snapshot giá',
  })
  async createBooking(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(user.userId, dto);
  }

  @Get('sent')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách yêu cầu thuê/mượn đã gửi của người thuê (Renter)',
  })
  async getSentBookings(
    @CurrentUser() user: RequestUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.getSentBookings(user.userId, query);
  }

  @Get('received')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lấy danh sách yêu cầu thuê/mượn nhận được của chủ thiết bị (Owner)',
  })
  async getReceivedBookings(
    @CurrentUser() user: RequestUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.getReceivedBookings(user.userId, query);
  }

  @Public()
  @Get('gear/:gearId/reviews')
  @ApiOperation({
    summary: 'Lấy danh sách đánh giá (Reviews) của một thiết bị du lịch',
  })
  async getGearReviews(@Param('gearId') gearId: string) {
    return this.bookingsService.getGearReviews(gearId);
  }

  @Public()
  @Get('user/:userId/reviews')
  @ApiOperation({
    summary: 'Lấy danh sách đánh giá uy tín của một thành viên',
  })
  async getUserReviewsByBookingRoute(@Param('userId') userId: string) {
    return this.bookingsService.getUserReviews(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Xem chi tiết giao dịch thuê/mượn kèm timeline trạng thái, biên bản bàn giao, đánh giá và tranh chấp',
  })
  async getBookingById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.getBookingById(id, user.userId, user.role);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Chủ thiết bị chấp nhận yêu cầu thuê (PENDING -> APPROVED) có kiểm soát chống trùng lịch (OCC)',
  })
  async approveBooking(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ApproveBookingDto,
  ) {
    return this.bookingsService.approveBooking(id, user.userId, user.role, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chủ thiết bị từ chối yêu cầu thuê (PENDING -> REJECTED)',
  })
  async rejectBooking(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RejectBookingDto,
  ) {
    return this.bookingsService.rejectBooking(id, user.userId, user.role, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Hủy giao dịch khi ở trạng thái PENDING hoặc APPROVED và giải phóng lịch đã giữ',
  })
  async cancelBooking(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(id, user.userId, user.role, dto);
  }

  @Post(':id/handover')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Xác nhận bàn giao nhận đồ (PICKUP) từ phía Chủ đồ hoặc Người thuê (Đủ 2 bên -> IN_USE)',
  })
  async confirmPickupHandover(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitHandoverDto,
  ) {
    return this.bookingsService.confirmPickupHandover(
      id,
      user.userId,
      user.role,
      dto,
    );
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Xác nhận hoàn trả thiết bị (RETURN): Bên 1 gửi -> RETURN_PENDING; Bên 2 xác nhận -> COMPLETED',
  })
  async confirmReturnHandover(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitHandoverDto,
  ) {
    return this.bookingsService.confirmReturnHandover(
      id,
      user.userId,
      user.role,
      dto,
    );
  }

  @Get(':id/handovers')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách biên bản bàn giao (PICKUP & RETURN) của giao dịch',
  })
  async getBookingHandovers(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bookingsService.getBookingHandovers(
      id,
      user.userId,
      user.role,
    );
  }

  @Post(':id/reviews')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Đánh giá đối tác sau khi giao dịch COMPLETED (1-5 sao, mỗi bên chỉ đánh giá 1 lần)',
  })
  async createReview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.bookingsService.createReview(id, user.userId, dto);
  }

  @Post(':id/disputes')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mở báo cáo khiếu nại / tranh chấp cho giao dịch thiết bị',
  })
  async createDispute(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.bookingsService.createDispute(
      id,
      user.userId,
      user.role,
      dto,
    );
  }
}

@ApiTags('Admin Disputes')
@Controller('admin/disputes')
@UseGuards(JwtAuthGuard)
export class AdminDisputesController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin lấy danh sách toàn bộ khiếu nại / tranh chấp giao dịch',
  })
  async getAdminDisputes(@CurrentUser() user: RequestUser) {
    return this.bookingsService.getAdminDisputes(user.role);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin cập nhật trạng thái và phán quyết xử lý tranh chấp',
  })
  async resolveDispute(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.bookingsService.resolveDispute(id, user.userId, user.role, dto);
  }
}
