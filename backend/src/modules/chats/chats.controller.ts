import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ChatsService } from './chats.service';
import { RealtimeGateway } from './realtime.gateway';
import {
  GetMessagesQueryDto,
  MarkConversationReadDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

@ApiTags('Chats & Realtime Messaging')
@Controller('chats')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Post('conversations/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mở hoặc lấy lại hội thoại chung duy nhất cho cặp thành viên (hỗ trợ đính kèm ngữ cảnh Gear hoặc Booking)',
  })
  async openOrGetConversation(
    @CurrentUser() user: RequestUser,
    @Body() dto: OpenConversationDto,
  ) {
    return this.chatsService.openOrGetConversation(user.userId, dto);
  }

  @Get('conversations')
  @ApiOperation({
    summary:
      'Lấy danh sách hội thoại của người dùng kèm tin nhắn gần nhất và số tin chưa đọc',
  })
  async listMyConversations(@CurrentUser() user: RequestUser) {
    return this.chatsService.listMyConversations(user.userId);
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Lấy chi tiết một cuộc hội thoại (kiểm tra quyền thành viên)',
  })
  async getConversationById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatsService.getConversationById(id, user.userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary:
      'Tải lịch sử tin nhắn theo cursor (beforeId) hoặc đồng bộ tin bị lỡ sau khi kết nối lại (afterId)',
  })
  async getMessages(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.chatsService.getMessages(id, user.userId, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary:
      'Gửi tin nhắn văn bản (hỗ trợ idempotency qua clientMessageId và phát realtime message:new)',
  })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chatsService.sendMessage(id, user.userId, dto);
    if (!result.deduplicated) {
      this.realtimeGateway.broadcastNewMessage(
        id,
        result.message,
        result.recipientIds,
        user.userId,
      );
    }
    return result;
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Đánh dấu đã đọc tin nhắn trong hội thoại và đồng bộ trạng thái đã đọc realtime',
  })
  async markConversationRead(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: MarkConversationReadDto,
  ) {
    const receipt = await this.chatsService.markConversationRead(
      id,
      user.userId,
      dto,
    );
    this.realtimeGateway.broadcastReadReceipt(receipt);
    return receipt;
  }
}
