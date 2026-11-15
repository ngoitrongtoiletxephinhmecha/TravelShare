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
import { AiService } from './ai.service';
import {
  CreateAiConversationDto,
  GetAiMessagesQueryDto,
  SendAiMessageDto,
} from './dto/ai.dto';

@ApiTags('AI Travel Assistant (Phase 6)')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('conversations')
  @ApiOperation({
    summary:
      'Tạo cuộc hội thoại Trợ lý AI mới (tùy chọn gửi kèm tin nhắn đầu tiên)',
  })
  async createConversation(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAiConversationDto,
  ) {
    return this.aiService.createConversation(user.userId, dto);
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'Lấy danh sách các cuộc hội thoại AI của người dùng hiện tại',
  })
  async listMyConversations(@CurrentUser() user: RequestUser) {
    return this.aiService.listMyConversations(user.userId);
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary:
      'Lấy chi tiết cuộc hội thoại AI kèm thông tin chuyến đi (tripState) và bản xem trước Checklist',
  })
  async getConversationById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiService.getConversationById(id, user.userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary:
      'Xem lịch sử tin nhắn có phân trang cursor (beforeId) của cuộc hội thoại AI',
  })
  async getConversationMessages(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: GetAiMessagesQueryDto,
  ) {
    return this.aiService.getConversationMessages(id, user.userId, query);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gửi tin nhắn tới AI Travel Assistant, trích xuất & cập nhật thông tin chuyến đi (hỗ trợ idempotency qua clientMessageId)',
  })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.aiService.sendMessage(id, user.userId, dto);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Endpoint tương thích hỗ trợ cả conversationId / sessionId hoặc tự tạo hội thoại mới nếu chưa có',
  })
  async chatCompatible(
    @CurrentUser() user: RequestUser,
    @Body()
    body: SendAiMessageDto & {
      conversationId?: string;
      sessionId?: string;
    },
  ) {
    const targetId = body.conversationId || body.sessionId;
    if (targetId) {
      return this.aiService.sendMessage(targetId, user.userId, body);
    }

    const created = await this.aiService.createConversation(user.userId, {});
    return this.aiService.sendMessage(created.id, user.userId, body);
  }
}
