import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Booking,
  BookingDocument,
  Conversation,
  ConversationContextCard,
  ConversationDocument,
  GearItem,
  GearItemDocument,
  Message,
  MessageDocument,
  Profile,
  ProfileDocument,
  User,
  UserDocument,
} from '../../database/schemas';
import {
  GetMessagesQueryDto,
  MarkConversationReadDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

@Injectable()
export class ChatsService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(GearItem.name)
    private gearModel: Model<GearItemDocument>,
    @InjectModel(Profile.name)
    private profileModel: Model<ProfileDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /**
   * Build canonical pair key for two userIds so A->B and B->A always map to the exact same unique key
   */
  static buildParticipantPairKey(userA: string, userB: string): string {
    return [String(userA).trim(), String(userB).trim()].sort().join(':');
  }

  /**
   * Assert that `userId` is one of the participants of `conversation`
   */
  assertIsParticipant(conversation: any, userId: string): void {
    const isMember = (conversation.participants || []).some(
      (p: any) => String(p) === String(userId),
    );
    if (!isMember) {
      throw new ForbiddenException(
        'Bạn không phải là thành viên của cuộc hội thoại này',
      );
    }
  }

  /**
   * Build and validate context card for a Gear or Booking
   * For Booking cards: strictly enforces that the 2 conversation participants are the booking's owner and renter!
   */
  async resolveContextCard(
    participantIds: string[],
    options?: { gearId?: string; bookingId?: string },
  ): Promise<ConversationContextCard | null> {
    if (!options?.bookingId && !options?.gearId) {
      return null;
    }

    if (options.bookingId) {
      if (!Types.ObjectId.isValid(options.bookingId)) {
        throw new NotFoundException('Không tìm thấy giao dịch đính kèm');
      }
      const booking = await this.bookingModel
        .findById(options.bookingId)
        .lean();
      if (!booking) {
        throw new NotFoundException('Không tìm thấy giao dịch đính kèm');
      }

      const bookingPairKey = ChatsService.buildParticipantPairKey(
        String(booking.ownerId),
        String(booking.renterId),
      );
      const convPairKey = ChatsService.buildParticipantPairKey(
        participantIds[0],
        participantIds[1],
      );

      if (bookingPairKey !== convPairKey) {
        throw new ForbiddenException(
          'Chỉ hai thành viên trực tiếp tham gia giao dịch (Chủ thiết bị và Người thuê) mới được đính kèm thẻ giao dịch này vào hội thoại',
        );
      }

      const snap = booking.pickupLocationSnapshot || ({} as any);
      return {
        type: 'BOOKING',
        refId: String(booking._id),
        title: `Giao dịch #${String(booking._id).slice(-6).toUpperCase()} • ${snap.gearTitle || 'Thiết bị du lịch'}`,
        subtitle: `Trạng thái: ${booking.status} • ${booking.rentalDays || booking.totalDays || 1} ngày`,
        status: booking.status,
        imageUrl: snap.images?.[0] || '',
        targetUrl: `/bookings/${String(booking._id)}`,
      };
    }

    if (options.gearId) {
      if (!Types.ObjectId.isValid(options.gearId)) {
        throw new NotFoundException('Không tìm thấy thiết bị đính kèm');
      }
      const gear = await this.gearModel.findById(options.gearId).lean();
      if (!gear) {
        throw new NotFoundException('Không tìm thấy thiết bị đính kèm');
      }

      const priceLabel =
        gear.sharingType === 'FREE_LOAN' || gear.pricePerDay === 0
          ? 'Cho mượn miễn phí'
          : `${Number(gear.pricePerDay || 0).toLocaleString('vi-VN')} ₫/ngày`;

      return {
        type: 'GEAR',
        refId: String(gear._id),
        title: gear.title,
        subtitle: `${priceLabel} • ${gear.district}, ${gear.city}`,
        status: gear.status,
        imageUrl: gear.images?.[0] || '',
        targetUrl: `/gear/${String(gear._id)}`,
      };
    }

    return null;
  }

  /**
   * Open or reuse the single shared conversation between currentUserId and targetUserId
   */
  async openOrGetConversation(
    currentUserId: string,
    dto: OpenConversationDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(dto.targetUserId)) {
      throw new NotFoundException('Không tìm thấy người dùng nhận tin nhắn');
    }

    if (String(currentUserId) === String(dto.targetUserId)) {
      throw new BadRequestException(
        'Bạn không thể tự tạo cuộc hội thoại với chính mình',
      );
    }

    const targetProfile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(dto.targetUserId) })
      .lean();
    const targetUser = !targetProfile
      ? await this.userModel.findById(dto.targetUserId).lean()
      : null;

    if (!targetProfile && !targetUser) {
      throw new NotFoundException('Không tìm thấy người dùng nhận tin nhắn');
    }

    const sortedStrings = [
      String(currentUserId),
      String(dto.targetUserId),
    ].sort();
    const pairKey = ChatsService.buildParticipantPairKey(
      sortedStrings[0],
      sortedStrings[1],
    );
    const participantObjIds = sortedStrings.map((id) => new Types.ObjectId(id));

    const contextCard = await this.resolveContextCard(sortedStrings, {
      gearId: dto.gearId,
      bookingId: dto.bookingId,
    });

    const now = new Date();
    let conversation: any;

    try {
      conversation = await this.conversationModel
        .findOneAndUpdate(
          { participantPairKey: pairKey },
          {
            $setOnInsert: {
              participants: participantObjIds,
              participantPairKey: pairKey,
              lastMessagePreview: '',
              lastMessageAt: now,
              readReceipts: {
                [String(currentUserId)]: { lastReadAt: now },
              },
            },
            ...(contextCard
              ? {
                  $set: {
                    activeContext: contextCard,
                    ...(dto.bookingId && Types.ObjectId.isValid(dto.bookingId)
                      ? { bookingId: new Types.ObjectId(dto.bookingId) }
                      : {}),
                    ...(dto.gearId && Types.ObjectId.isValid(dto.gearId)
                      ? { gearId: new Types.ObjectId(dto.gearId) }
                      : {}),
                  },
                }
              : {}),
          },
          { upsert: true, new: true },
        )
        .lean();
    } catch (err: any) {
      if (err?.code === 11000) {
        conversation = await this.conversationModel
          .findOne({ participantPairKey: pairKey })
          .lean();
      } else {
        throw err;
      }
    }

    const hydrated = await this.hydrateConversations(
      [conversation],
      currentUserId,
    );
    return hydrated[0];
  }

  /**
   * List all conversations for currentUserId sorted by lastMessageAt DESC
   */
  async listMyConversations(
    currentUserId: string,
  ): Promise<Record<string, any>[]> {
    const userObjId = new Types.ObjectId(String(currentUserId));
    const list = await this.conversationModel
      .find({ participants: userObjId })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();

    return this.hydrateConversations(list, currentUserId);
  }

  /**
   * Get single conversation metadata (verifying membership)
   */
  async getConversationById(
    conversationId: string,
    currentUserId: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    const conv = await this.conversationModel.findById(conversationId).lean();
    if (!conv) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    this.assertIsParticipant(conv, currentUserId);

    const hydrated = await this.hydrateConversations([conv], currentUserId);
    return hydrated[0];
  }

  /**
   * Get messages with cursor pagination (`beforeId`) or reconnect delta sync (`afterId`)
   */
  async getMessages(
    conversationId: string,
    currentUserId: string,
    query: GetMessagesQueryDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    const conv = await this.conversationModel.findById(conversationId).lean();
    if (!conv) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    this.assertIsParticipant(conv, currentUserId);

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const filter: Record<string, any> = {
      conversationId: new Types.ObjectId(conversationId),
    };

    if (query.afterId && Types.ObjectId.isValid(query.afterId)) {
      filter._id = { $gt: new Types.ObjectId(query.afterId) };
      const deltaMessages = await this.messageModel
        .find(filter)
        .sort({ _id: 1 })
        .limit(limit)
        .lean();

      return {
        conversationId,
        items: deltaMessages.map((m: any) => this.formatMessage(m)),
        nextCursor: null,
        hasMore: false,
      };
    }

    if (query.beforeId && Types.ObjectId.isValid(query.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(query.beforeId) };
    }

    const docsDesc = await this.messageModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docsDesc.length > limit;
    const slicedDesc = hasMore ? docsDesc.slice(0, limit) : docsDesc;
    const chronological = [...slicedDesc].reverse();
    const nextCursor =
      hasMore && chronological.length > 0
        ? String(chronological[0]._id)
        : null;

    return {
      conversationId,
      items: chronological.map((m: any) => this.formatMessage(m)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Send a message idempotently by `{ conversationId, senderId, clientMessageId }`.
   * Saves to MongoDB first before returning so Socket.IO only acknowledges and emits after durable write.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<{
    message: Record<string, any>;
    conversation: Record<string, any>;
    recipientIds: string[];
    deduplicated: boolean;
  }> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    const conv = await this.conversationModel.findById(conversationId).lean();
    if (!conv) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    this.assertIsParticipant(conv, senderId);

    const trimmedContent = dto.content?.trim();
    if (!trimmedContent) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống');
    }

    const clientMessageId = dto.clientMessageId?.trim();
    if (!clientMessageId) {
      throw new BadRequestException('Thiếu clientMessageId');
    }

    const convObjId = new Types.ObjectId(conversationId);
    const senderObjId = new Types.ObjectId(String(senderId));

    // Check if this clientMessageId was already stored (idempotent retry protection)
    const existingMsg = await this.messageModel
      .findOne({
        conversationId: convObjId,
        senderId: senderObjId,
        clientMessageId,
      })
      .lean();

    const participantStrings = (conv.participants || []).map((p: any) =>
      String(p),
    );
    const recipientIds = participantStrings.filter(
      (id) => id !== String(senderId),
    );

    if (existingMsg) {
      const hydratedConv = await this.hydrateConversations([conv], senderId);
      return {
        message: this.formatMessage(existingMsg),
        conversation: hydratedConv[0],
        recipientIds,
        deduplicated: true,
      };
    }

    const contextCard = await this.resolveContextCard(participantStrings, {
      gearId: dto.gearId,
      bookingId: dto.bookingId,
    });

    let createdMsg: any;
    let deduplicated = false;

    try {
      const doc = await this.messageModel.create({
        conversationId: convObjId,
        senderId: senderObjId,
        clientMessageId,
        content: trimmedContent,
        contextCard: contextCard || null,
        readBy: [senderObjId],
      });
      createdMsg = doc.toObject();
    } catch (err: any) {
      if (err?.code === 11000) {
        createdMsg = await this.messageModel
          .findOne({
            conversationId: convObjId,
            senderId: senderObjId,
            clientMessageId,
          })
          .lean();
        deduplicated = true;
      } else {
        throw err;
      }
    }

    const now = new Date();
    const updatedReceipts = {
      ...(conv.readReceipts || {}),
      [String(senderId)]: {
        lastReadMessageId: String(createdMsg._id),
        lastReadAt: now,
      },
    };

    const updatedConv = await this.conversationModel
      .findByIdAndUpdate(
        conv._id,
        {
          $set: {
            lastMessageId: createdMsg._id,
            lastMessageSenderId: senderObjId,
            lastMessagePreview: trimmedContent.slice(0, 140),
            lastMessageAt: createdMsg.createdAt || now,
            readReceipts: updatedReceipts,
            ...(contextCard ? { activeContext: contextCard } : {}),
          },
        },
        { new: true },
      )
      .lean();

    const hydratedConv = await this.hydrateConversations(
      [updatedConv || conv],
      senderId,
    );

    return {
      message: this.formatMessage(createdMsg),
      conversation: hydratedConv[0],
      recipientIds,
      deduplicated,
    };
  }

  /**
   * Mark conversation messages as read for `userId`
   */
  async markConversationRead(
    conversationId: string,
    userId: string,
    dto?: MarkConversationReadDto,
  ): Promise<{
    conversationId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    otherParticipantIds: string[];
  }> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    const conv = await this.conversationModel.findById(conversationId).lean();
    if (!conv) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    this.assertIsParticipant(conv, userId);

    const userObjId = new Types.ObjectId(String(userId));
    const now = new Date();

    let lastMsgId = dto?.lastReadMessageId || null;
    if (!lastMsgId && conv.lastMessageId) {
      lastMsgId = String(conv.lastMessageId);
    }

    await Promise.all([
      this.messageModel.updateMany(
        {
          conversationId: conv._id,
          readBy: { $ne: userObjId },
        },
        {
          $addToSet: { readBy: userObjId },
        },
      ),
      this.conversationModel.updateOne(
        { _id: conv._id },
        {
          $set: {
            [`readReceipts.${String(userId)}`]: {
              lastReadMessageId: lastMsgId || undefined,
              lastReadAt: now,
            },
          },
        },
      ),
    ]);

    const otherParticipantIds = (conv.participants || [])
      .map((p: any) => String(p))
      .filter((id: string) => id !== String(userId));

    return {
      conversationId: String(conv._id),
      userId: String(userId),
      lastReadMessageId: lastMsgId,
      lastReadAt: now.toISOString(),
      otherParticipantIds,
    };
  }

  private formatMessage(m: any): Record<string, any> {
    if (!m) return {};
    return {
      id: String(m._id),
      conversationId: String(m.conversationId),
      senderId: String(m.senderId),
      clientMessageId: m.clientMessageId,
      content: m.content,
      contextCard: m.contextCard || null,
      readBy: (m.readBy || []).map((id: any) => String(id)),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private async hydrateConversations(
    conversations: any[],
    viewerId: string,
  ): Promise<Record<string, any>[]> {
    if (conversations.length === 0) return [];

    const allParticipantIds = Array.from(
      new Set(
        conversations.flatMap((c) =>
          (c.participants || []).map((p: any) => String(p)),
        ),
      ),
    ).map((id) => new Types.ObjectId(id));

    const profiles =
      allParticipantIds.length > 0
        ? await this.profileModel
            .find({ userId: { $in: allParticipantIds } })
            .lean()
        : [];

    const profileMap = new Map<string, any>(
      profiles.map((p: any) => [String(p.userId), p] as [string, any]),
    );

    const viewerObjId = new Types.ObjectId(String(viewerId));

    const unreadCounts = await Promise.all(
      conversations.map((c) =>
        this.messageModel.countDocuments({
          conversationId: c._id,
          senderId: { $ne: viewerObjId },
          readBy: { $ne: viewerObjId },
        }),
      ),
    );

    return conversations.map((c: any, idx: number) => {
      const participantIds = (c.participants || []).map((p: any) => String(p));
      const partnerId =
        participantIds.find((id: string) => id !== String(viewerId)) ||
        participantIds[0];
      const partnerProf = profileMap.get(String(partnerId));

      return {
        id: String(c._id),
        participantPairKey: c.participantPairKey,
        participants: participantIds,
        partner: {
          userId: String(partnerId),
          username: partnerProf?.username || 'member',
          fullName: partnerProf?.fullName || 'Thành viên TravelShare',
          avatarUrl: partnerProf?.avatarUrl || '',
          city: partnerProf?.city || 'Việt Nam',
          trustScore: partnerProf?.trustScore ?? 5.0,
        },
        activeContext: c.activeContext || null,
        lastMessageId: c.lastMessageId ? String(c.lastMessageId) : null,
        lastMessageSenderId: c.lastMessageSenderId
          ? String(c.lastMessageSenderId)
          : null,
        lastMessagePreview: c.lastMessagePreview || '',
        lastMessageAt: c.lastMessageAt || c.updatedAt || c.createdAt,
        unreadCount: unreadCounts[idx] || 0,
        readReceipts: c.readReceipts || {},
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }
}
