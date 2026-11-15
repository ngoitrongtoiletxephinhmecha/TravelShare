import {
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatsService } from './chats.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingEventsService } from '../bookings/booking-events.service';
import {
  BookingStatus,
  GearListingType,
  NotificationType,
} from '../../common/enums/system.enums';

describe('ChatsService & NotificationsService Suite (Phase 5)', () => {
  const userAId = new Types.ObjectId().toString(); // Owner in Booking 1
  const userBId = new Types.ObjectId().toString(); // Renter in Booking 1
  const userCId = new Types.ObjectId().toString(); // Outsider Account C
  const gearId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();

  let conversationsStore: Map<string, any>;
  let messagesStore: Map<string, any>;
  let notificationsStore: Map<string, any>;
  let usersStore: Map<string, any>;
  let profilesStore: Map<string, any>;
  let gearsStore: Map<string, any>;
  let bookingsStore: Map<string, any>;

  let chatsService: ChatsService;
  let notificationsService: NotificationsService;
  let bookingEventsService: BookingEventsService;
  let emittedRealtimeNotifications: Array<{
    recipientId: string;
    notification: Record<string, any>;
  }>;

  const makeChainable = (result: any) => ({
    lean: jest.fn().mockResolvedValue(result),
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
    sort: jest.fn().mockImplementation((sortObj: Record<string, number>) => {
      const sorted = Array.isArray(result) ? [...result] : result;
      if (Array.isArray(sorted)) {
        if (sortObj._id === -1) {
          sorted.sort((a, b) =>
            String(b._id).localeCompare(String(a._id)),
          );
        } else if (sortObj._id === 1) {
          sorted.sort((a, b) =>
            String(a._id).localeCompare(String(b._id)),
          );
        }
      }
      return {
        lean: jest.fn().mockResolvedValue(sorted),
        limit: jest.fn().mockImplementation((n: number) => ({
          lean: jest.fn().mockResolvedValue(
            Array.isArray(sorted) ? sorted.slice(0, n) : sorted,
          ),
        })),
        skip: jest.fn().mockImplementation((s: number) => ({
          limit: jest.fn().mockImplementation((n: number) => ({
            lean: jest.fn().mockResolvedValue(
              Array.isArray(sorted) ? sorted.slice(s, s + n) : sorted,
            ),
          })),
        })),
      };
    }),
  });

  beforeEach(() => {
    conversationsStore = new Map();
    messagesStore = new Map();
    notificationsStore = new Map();
    usersStore = new Map();
    profilesStore = new Map();
    gearsStore = new Map();
    bookingsStore = new Map();
    emittedRealtimeNotifications = [];

    // Seed Users & Profiles
    for (const [id, name, username] of [
      [userAId, 'Nguyễn Minh Khoa', 'minhkhoa'],
      [userBId, 'Lê Bảo Ngọc', 'baongoc'],
      [userCId, 'Trần Quốc Bảo', 'quocbao'],
    ]) {
      usersStore.set(id, {
        _id: new Types.ObjectId(id),
        email: `${username}@travelshare.vn`,
      });
      profilesStore.set(id, {
        userId: new Types.ObjectId(id),
        username,
        fullName: name,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        isVerified: true,
      });
    }

    // Seed Gear owned by User A
    gearsStore.set(gearId, {
      _id: new Types.ObjectId(gearId),
      ownerId: new Types.ObjectId(userAId),
      title: 'Lều Naturehike Cloud Up 2 20D',
      sharingType: GearListingType.RENT,
      pricePerDay: 120000,
      dailyPriceVnd: 120000,
      images: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'],
    });

    // Seed Booking between User A (owner) and User B (renter)
    bookingsStore.set(bookingId, {
      _id: new Types.ObjectId(bookingId),
      gearId: new Types.ObjectId(gearId),
      ownerId: new Types.ObjectId(userAId),
      renterId: new Types.ObjectId(userBId),
      status: BookingStatus.PENDING,
      rentalDays: 3,
      rentalTotal: 360000,
      pickupLocationSnapshot: {
        gearTitle: 'Lều Naturehike Cloud Up 2 20D',
        images: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4'],
      },
    });

    // Mock ConversationModel
    const mockConversationModel: any = {
      findOneAndUpdate: jest.fn().mockImplementation((filter: any, update: any) => {
        let existing = Array.from(conversationsStore.values()).find(
          (c) =>
            (filter.participantPairKey &&
              c.participantPairKey === filter.participantPairKey) ||
            (filter._id && String(c._id) === String(filter._id)),
        );
        if (!existing && update.$setOnInsert) {
          const id = new Types.ObjectId();
          existing = {
            _id: id,
            ...update.$setOnInsert,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (existing && update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
        }
        if (existing) {
          conversationsStore.set(String(existing._id), existing);
        }
        return makeChainable(existing);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id: any, update: any) => {
        const existing = conversationsStore.get(String(id));
        if (existing && update.$set) {
          Object.assign(existing, update.$set, { updatedAt: new Date() });
          conversationsStore.set(String(existing._id), existing);
        }
        return makeChainable(existing || null);
      }),
      findById: jest.fn().mockImplementation((id: any) => {
        const doc = conversationsStore.get(String(id)) || null;
        return makeChainable(doc);
      }),
      findOne: jest.fn().mockImplementation((filter: any) => {
        const doc =
          Array.from(conversationsStore.values()).find(
            (c) => c.participantPairKey === filter.participantPairKey,
          ) || null;
        return makeChainable(doc);
      }),
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(conversationsStore.values()).filter((c) => {
          if (filter.participants) {
            return c.participants.some(
              (p: any) => String(p) === String(filter.participants),
            );
          }
          return true;
        });
        return makeChainable(list);
      }),
      updateOne: jest.fn().mockImplementation((filter: any, update: any) => {
        const existing = conversationsStore.get(String(filter._id));
        if (existing && update.$set) {
          for (const [k, v] of Object.entries(update.$set)) {
            if (k.startsWith('readReceipts.')) {
              const uid = k.replace('readReceipts.', '');
              existing.readReceipts = {
                ...(existing.readReceipts || {}),
                [uid]: v,
              };
            } else {
              existing[k] = v;
            }
          }
          conversationsStore.set(String(existing._id), existing);
        }
        return Promise.resolve({ modifiedCount: existing ? 1 : 0 });
      }),
    };

    // Mock MessageModel
    const mockMessageModel: any = {
      findOne: jest.fn().mockImplementation((filter: any) => {
        const found =
          Array.from(messagesStore.values()).find(
            (m) =>
              String(m.conversationId) === String(filter.conversationId) &&
              String(m.senderId) === String(filter.senderId) &&
              m.clientMessageId === filter.clientMessageId,
          ) || null;
        return makeChainable(found);
      }),
      create: jest.fn().mockImplementation((payload: any) => {
        if (payload.clientMessageId) {
          const dup = Array.from(messagesStore.values()).find(
            (m) =>
              String(m.conversationId) === String(payload.conversationId) &&
              String(m.senderId) === String(payload.senderId) &&
              m.clientMessageId === payload.clientMessageId,
          );
          if (dup) {
            const err: any = new Error('Duplicate key');
            err.code = 11000;
            throw err;
          }
        }
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        messagesStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(messagesStore.values()).filter((m) => {
          if (String(m.conversationId) !== String(filter.conversationId)) {
            return false;
          }
          if (filter._id?.$lt) {
            return String(m._id) < String(filter._id.$lt);
          }
          if (filter._id?.$gt) {
            return String(m._id) > String(filter._id.$gt);
          }
          return true;
        });
        return makeChainable(list);
      }),
      countDocuments: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(messagesStore.values()).filter((m) => {
          if (String(m.conversationId) !== String(filter.conversationId)) {
            return false;
          }
          if (
            filter.senderId?.$ne &&
            String(m.senderId) === String(filter.senderId.$ne)
          ) {
            return false;
          }
          return true;
        });
        return Promise.resolve(list.length);
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    // Mock NotificationModel
    const mockNotificationModel: any = {
      findOne: jest.fn().mockImplementation((filter: any) => {
        const found =
          Array.from(notificationsStore.values()).find(
            (n) => filter.dedupeKey && n.dedupeKey === filter.dedupeKey,
          ) || null;
        return makeChainable(found);
      }),
      findById: jest.fn().mockImplementation((id: any) => {
        const found = notificationsStore.get(String(id)) || null;
        return makeChainable(found);
      }),
      findByIdAndUpdate: jest
        .fn()
        .mockImplementation((id: any, update: any) => {
          const existing = notificationsStore.get(String(id));
          if (existing && update.$set) {
            Object.assign(existing, update.$set, { updatedAt: new Date() });
            notificationsStore.set(String(id), existing);
          }
          return makeChainable(existing || null);
        }),
      create: jest.fn().mockImplementation((payload: any) => {
        if (payload.dedupeKey) {
          const dup = Array.from(notificationsStore.values()).find(
            (n) => n.dedupeKey === payload.dedupeKey,
          );
          if (dup) {
            const err: any = new Error('Duplicate key');
            err.code = 11000;
            throw err;
          }
        }
        const id = new Types.ObjectId();
        const doc = {
          _id: id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject() {
            return { ...this };
          },
        };
        notificationsStore.set(String(id), doc);
        return Promise.resolve(doc);
      }),
      find: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(notificationsStore.values()).filter((n) => {
          if (
            filter.recipientId &&
            String(n.recipientId) !== String(filter.recipientId)
          ) {
            return false;
          }
          if (typeof filter.isRead === 'boolean' && n.isRead !== filter.isRead) {
            return false;
          }
          return true;
        });
        return makeChainable(list);
      }),
      countDocuments: jest.fn().mockImplementation((filter: any) => {
        const list = Array.from(notificationsStore.values()).filter((n) => {
          if (
            filter.recipientId &&
            String(n.recipientId) !== String(filter.recipientId)
          ) {
            return false;
          }
          if (typeof filter.isRead === 'boolean' && n.isRead !== filter.isRead) {
            return false;
          }
          return true;
        });
        return Promise.resolve(list.length);
      }),
      updateMany: jest.fn().mockImplementation((filter: any, update: any) => {
        let count = 0;
        for (const n of notificationsStore.values()) {
          if (
            String(n.recipientId) === String(filter.recipientId) &&
            n.isRead === filter.isRead
          ) {
            Object.assign(n, update.$set);
            count++;
          }
        }
        return Promise.resolve({ modifiedCount: count });
      }),
    };

    const mockUserModel: any = {
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(usersStore.get(String(id)) || null);
      }),
      find: jest.fn().mockImplementation(() => {
        return makeChainable(Array.from(usersStore.values()));
      }),
    };

    const mockProfileModel: any = {
      findOne: jest.fn().mockImplementation((filter: any) => {
        return makeChainable(profilesStore.get(String(filter.userId)) || null);
      }),
      find: jest.fn().mockImplementation(() => {
        return makeChainable(Array.from(profilesStore.values()));
      }),
    };

    const mockGearModel: any = {
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(gearsStore.get(String(id)) || null);
      }),
    };

    const mockBookingModel: any = {
      findById: jest.fn().mockImplementation((id: any) => {
        return makeChainable(bookingsStore.get(String(id)) || null);
      }),
    };

    bookingEventsService = new BookingEventsService();

    chatsService = new ChatsService(
      mockConversationModel,
      mockMessageModel,
      mockBookingModel,
      mockGearModel,
      mockProfileModel,
      mockUserModel,
    );

    notificationsService = new NotificationsService(
      mockNotificationModel,
      bookingEventsService,
    );
    notificationsService.registerRealtimeDispatcher((recipientId, notification) => {
      emittedRealtimeNotifications.push({ recipientId, notification });
    });
    notificationsService.onModuleInit();
  });

  // =========================================================================
  // 1. CANONICAL PARTICIPANT PAIR KEY & SHARED CONVERSATION REUSE
  // =========================================================================
  it('reuses a single conversation for User A and User B regardless of who initiates or role switches', async () => {
    // User B (renter) clicks "Nhắn tin" on User A's Gear
    const convFromB = await chatsService.openOrGetConversation(userBId, {
      targetUserId: userAId,
      gearId,
    });

    expect(convFromB.id).toBeDefined();
    expect(convFromB.activeContext?.type).toBe('GEAR');
    expect(convFromB.activeContext?.refId).toBe(gearId);

    // User A (owner) clicks "Trao đổi về giao dịch" on Booking with User B
    const convFromA = await chatsService.openOrGetConversation(userAId, {
      targetUserId: userBId,
      bookingId,
    });

    // Must be the exact same conversation ID
    expect(convFromA.id).toBe(convFromB.id);
    expect(conversationsStore.size).toBe(1);
    expect(convFromA.activeContext?.type).toBe('BOOKING');
    expect(convFromA.activeContext?.refId).toBe(bookingId);
  });

  // =========================================================================
  // 2. CONTEXT CARD & MEMBERSHIP AUTHORIZATION (ACCOUNT C REJECTED)
  // =========================================================================
  it('blocks Account C from attaching A-B booking context or reading/sending in A-B conversation', async () => {
    // Account C tries to open a conversation with User A attaching A-B's bookingId
    await expect(
      chatsService.openOrGetConversation(userCId, {
        targetUserId: userAId,
        bookingId,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Legitimate conversation between User A and User B
    const conv = await chatsService.openOrGetConversation(userAId, {
      targetUserId: userBId,
      bookingId,
    });

    // Account C tries to view conversation detail
    await expect(
      chatsService.getConversationById(conv.id, userCId),
    ).rejects.toThrow(ForbiddenException);

    // Account C tries to list messages in A-B conversation
    await expect(
      chatsService.getMessages(conv.id, userCId, { limit: 20 }),
    ).rejects.toThrow(ForbiddenException);

    // Account C tries to send a message into A-B conversation
    await expect(
      chatsService.sendMessage(conv.id, userCId, {
        content: 'Tin nhắn trái phép từ tài khoản C',
        clientMessageId: 'unauthorized-c-1',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Account C tries to mark A-B conversation as read
    await expect(
      chatsService.markConversationRead(conv.id, userCId),
    ).rejects.toThrow(ForbiddenException);
  });

  // =========================================================================
  // 3. IDEMPOTENT MESSAGE SENDING WITH clientMessageId
  // =========================================================================
  it('saves message once and deduplicates retries with the same clientMessageId', async () => {
    const conv = await chatsService.openOrGetConversation(userBId, {
      targetUserId: userAId,
      bookingId,
    });

    const clientMessageId = 'client-msg-uuid-001';

    const firstSend = await chatsService.sendMessage(conv.id, userBId, {
      content: 'Chào anh Khoa, mình hẹn nhận lều lúc 18h nhé!',
      clientMessageId,
      bookingId,
    });

    expect(firstSend.deduplicated).toBe(false);
    expect(firstSend.message.clientMessageId).toBe(clientMessageId);
    expect(firstSend.message.contextCard?.type).toBe('BOOKING');
    expect(messagesStore.size).toBe(1);

    // Simulate network retry with the exact same clientMessageId
    const retrySend = await chatsService.sendMessage(conv.id, userBId, {
      content: 'Chào anh Khoa, mình hẹn nhận lều lúc 18h nhé!',
      clientMessageId,
      bookingId,
    });

    expect(retrySend.deduplicated).toBe(true);
    expect(retrySend.message.id).toBe(firstSend.message.id);
    expect(messagesStore.size).toBe(1);
  });

  // =========================================================================
  // 4. CURSOR PAGINATION, RECONNECT DELTA SYNC (afterId) & READ RECEIPTS
  // =========================================================================
  it('supports cursor pagination (beforeId), reconnect delta sync (afterId), and read receipts', async () => {
    const conv = await chatsService.openOrGetConversation(userAId, {
      targetUserId: userBId,
    });

    const sent1 = await chatsService.sendMessage(conv.id, userAId, {
      content: 'Tin nhắn 1',
      clientMessageId: 'msg-1',
    });
    await chatsService.sendMessage(conv.id, userBId, {
      content: 'Tin nhắn 2',
      clientMessageId: 'msg-2',
    });
    const sent3 = await chatsService.sendMessage(conv.id, userAId, {
      content: 'Tin nhắn 3',
      clientMessageId: 'msg-3',
    });

    // Reconnect delta sync: fetch messages strictly after sent1.message.id
    const delta = await chatsService.getMessages(conv.id, userBId, {
      afterId: sent1.message.id,
      limit: 10,
    });
    expect(delta.items.map((m: any) => m.content)).toEqual([
      'Tin nhắn 2',
      'Tin nhắn 3',
    ]);

    // Mark conversation read by User B
    const readReceipt = await chatsService.markConversationRead(
      conv.id,
      userBId,
      { lastReadMessageId: sent3.message.id },
    );
    expect(readReceipt.userId).toBe(userBId);
    expect(readReceipt.lastReadMessageId).toBe(sent3.message.id);
  });

  // =========================================================================
  // 5. TRANSACTION NOTIFICATIONS & IDEMPOTENT DEDUPLICATION BY dedupeKey
  // =========================================================================
  it('creates booking notifications on status changes, deduplicates retries, and notifies both parties on COMPLETED', async () => {
    const baseEvent = {
      bookingId,
      gearId,
      ownerId: userAId,
      renterId: userBId,
      occurredAt: new Date().toISOString(),
    };

    // 1. Booking requested by Renter (B) -> notifies Owner (A)
    bookingEventsService.emit({
      ...baseEvent,
      event: 'booking.requested',
      actorId: userBId,
    });

    await new Promise((r) => setTimeout(r, 30));

    let ownerNotifs = await notificationsService.getMyNotifications(userAId, {
      page: 1,
      limit: 10,
    });
    expect(ownerNotifs.items.length).toBe(1);
    expect(ownerNotifs.items[0].type).toBe(NotificationType.BOOKING_REQUEST);
    expect(ownerNotifs.items[0].targetUrl).toBe(`/bookings/${bookingId}`);

    // Re-emitting the exact same event must NOT create a duplicate notification
    bookingEventsService.emit({
      ...baseEvent,
      event: 'booking.requested',
      actorId: userBId,
    });
    await new Promise((r) => setTimeout(r, 30));

    ownerNotifs = await notificationsService.getMyNotifications(userAId, {
      page: 1,
      limit: 10,
    });
    expect(ownerNotifs.items.length).toBe(1);

    // 2. Booking completed -> notifies BOTH Owner (A) and Renter (B)
    bookingEventsService.emit({
      ...baseEvent,
      event: 'booking.completed',
      actorId: userAId,
    });
    await new Promise((r) => setTimeout(r, 30));

    ownerNotifs = await notificationsService.getMyNotifications(userAId, {
      page: 1,
      limit: 10,
    });
    const renterNotifs = await notificationsService.getMyNotifications(userBId, {
      page: 1,
      limit: 10,
    });

    expect(
      ownerNotifs.items.some(
        (n: any) => n.type === NotificationType.BOOKING_COMPLETED,
      ),
    ).toBe(true);
    expect(
      renterNotifs.items.some(
        (n: any) => n.type === NotificationType.BOOKING_COMPLETED,
      ),
    ).toBe(true);

    // 3. Account C cannot mark User A's notification as read
    const notifId = ownerNotifs.items[0].id;
    await expect(
      notificationsService.markAsRead(userCId, notifId),
    ).rejects.toThrow(ForbiddenException);

    // User A marks it as read
    const updatedNotif = await notificationsService.markAsRead(
      userAId,
      notifId,
    );
    expect(updatedNotif.notification.isRead).toBe(true);
  });
});
