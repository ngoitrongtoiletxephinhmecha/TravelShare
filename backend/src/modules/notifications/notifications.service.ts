import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  OutboxEvent,
  OutboxEventDocument,
} from '../../database/schemas';
import { NotificationType } from '../../common/enums/system.enums';
import {
  BookingDomainEventPayload,
  BookingEventsService,
} from '../bookings/booking-events.service';
import { ListNotificationsQueryDto } from './dto/notification.dto';

export type RealtimeNotificationDispatcher = (
  recipientId: string,
  notification: Record<string, any>,
) => void;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private realtimeDispatcher?: RealtimeNotificationDispatcher;
  private outboxInterval?: ReturnType<typeof setInterval>;
  private isRecoveringOutbox = false;

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private readonly bookingEventsService: BookingEventsService,
    @Optional()
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel?: Model<OutboxEventDocument>,
  ) {}

  onModuleInit() {
    this.bookingEventsService.onEvent(async (payload) => {
      await this.processBookingEventWithOutbox(payload);
    });

    if (this.outboxModel) {
      void this.recoverPendingOutboxEvents();
      this.outboxInterval = setInterval(() => {
        void this.recoverPendingOutboxEvents();
      }, 15000);
      if (typeof this.outboxInterval.unref === 'function') {
        this.outboxInterval.unref();
      }
    }
  }

  onModuleDestroy() {
    if (this.outboxInterval) {
      clearInterval(this.outboxInterval);
      this.outboxInterval = undefined;
    }
  }

  registerRealtimeDispatcher(dispatcher: RealtimeNotificationDispatcher) {
    this.realtimeDispatcher = dispatcher;
  }

  /**
   * Finite retry wrapper for durable notification persistence
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 50));
        }
      }
    }
    throw lastErr;
  }

  /**
   * Idempotently persist a notification by `dedupeKey` and emit `notification:new` if newly created
   */
  async createIdempotentNotification(params: {
    recipientId: string;
    actorId?: string;
    bookingId?: string;
    gearId?: string;
    type: NotificationType;
    dedupeKey: string;
    title: string;
    body: string;
    targetUrl: string;
  }): Promise<{ notification: Record<string, any>; created: boolean }> {
    return this.withRetry(async () => {
      const existing = await this.notificationModel
        .findOne({ dedupeKey: params.dedupeKey })
        .lean();

      if (existing) {
        return {
          notification: this.formatNotification(existing),
          created: false,
        };
      }

      try {
        const doc = await this.notificationModel.create({
          recipientId: new Types.ObjectId(String(params.recipientId)),
          actorId:
            params.actorId && Types.ObjectId.isValid(params.actorId)
              ? new Types.ObjectId(String(params.actorId))
              : undefined,
          bookingId:
            params.bookingId && Types.ObjectId.isValid(params.bookingId)
              ? new Types.ObjectId(String(params.bookingId))
              : undefined,
          gearId:
            params.gearId && Types.ObjectId.isValid(params.gearId)
              ? new Types.ObjectId(String(params.gearId))
              : undefined,
          type: params.type,
          dedupeKey: params.dedupeKey,
          title: params.title,
          body: params.body,
          targetUrl: params.targetUrl,
          isRead: false,
          readAt: null,
        });

        const formatted = this.formatNotification(doc.toObject());
        if (this.realtimeDispatcher) {
          this.realtimeDispatcher(String(params.recipientId), formatted);
        }

        return {
          notification: formatted,
          created: true,
        };
      } catch (err: any) {
        if (err?.code === 11000) {
          const dup = await this.notificationModel
            .findOne({ dedupeKey: params.dedupeKey })
            .lean();
          return {
            notification: this.formatNotification(dup),
            created: false,
          };
        }
        throw err;
      }
    });
  }

  /**
   * Handle booking domain events emitted after database state transitions succeed
   */
  async handleBookingDomainEvent(
    payload: BookingDomainEventPayload,
  ): Promise<Record<string, any>[]> {
    const { event, bookingId, gearId, renterId, ownerId, actorId, metadata } =
      payload;
    const targetUrl = `/bookings/${bookingId}`;
    const shortCode = `#${String(bookingId).slice(-6).toUpperCase()}`;
    const createdList: Record<string, any>[] = [];

    try {
      switch (event) {
        case 'booking.requested': {
          const res = await this.createIdempotentNotification({
            recipientId: ownerId,
            actorId: renterId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_REQUEST,
            dedupeKey: `booking:${bookingId}:requested:${ownerId}`,
            title: `Yêu cầu thuê thiết bị mới (${shortCode})`,
            body: 'Có thành viên vừa gửi yêu cầu thuê/mượn thiết bị của bạn. Nhấn để xem chi tiết và phê duyệt.',
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.approved': {
          const res = await this.createIdempotentNotification({
            recipientId: renterId,
            actorId: ownerId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_APPROVED,
            dedupeKey: `booking:${bookingId}:approved:${renterId}`,
            title: `Yêu cầu thuê ${shortCode} đã được duyệt!`,
            body: 'Chủ thiết bị đã chấp nhận yêu cầu thuê của bạn. Hãy trao đổi lịch hẹn nhận đồ và xác nhận biên bản bàn giao (Handover).',
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.rejected': {
          const res = await this.createIdempotentNotification({
            recipientId: renterId,
            actorId: ownerId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_REJECTED,
            dedupeKey: `booking:${bookingId}:rejected:${renterId}`,
            title: `Yêu cầu thuê ${shortCode} bị từ chối`,
            body: 'Chủ thiết bị hiện chưa thể cho thuê trong khoảng thời gian này. Nhấn để xem phản hồi.',
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.cancelled': {
          const recipientId =
            String(actorId) === String(renterId) ? ownerId : renterId;
          const res = await this.createIdempotentNotification({
            recipientId,
            actorId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_CANCELLED,
            dedupeKey: `booking:${bookingId}:cancelled:${recipientId}`,
            title: `Giao dịch ${shortCode} đã bị hủy`,
            body: `Đối tác đã hủy giao dịch thuê thiết bị${metadata?.reason ? `: "${metadata.reason}"` : ''}. Lịch thiết bị đã được giải phóng.`,
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.handed_over': {
          const recipientId =
            String(actorId) === String(renterId) ? ownerId : renterId;
          const stage = metadata?.stage || 'CONFIRMED';
          const isPendingPartner = stage === 'PENDING_PARTNER';

          const res = await this.createIdempotentNotification({
            recipientId,
            actorId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_HANDED_OVER,
            dedupeKey: `booking:${bookingId}:handed_over:${stage}:${recipientId}`,
            title: isPendingPartner
              ? `Cần xác nhận bàn giao nhận đồ (${shortCode})`
              : `Bàn giao thiết bị thành công (${shortCode})`,
            body: isPendingPartner
              ? 'Đối tác đã ký xác nhận biên bản bàn giao nhận thiết bị. Vui lòng kiểm tra và xác nhận để bắt đầu sử dụng.'
              : 'Cả hai bên đã hoàn tất xác nhận bàn giao. Giao dịch đã chuyển sang trạng thái Đang sử dụng (IN_USE).',
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.returned': {
          const recipientId =
            String(actorId) === String(renterId) ? ownerId : renterId;
          const res = await this.createIdempotentNotification({
            recipientId,
            actorId,
            bookingId,
            gearId,
            type: NotificationType.BOOKING_RETURN_PENDING,
            dedupeKey: `booking:${bookingId}:returned:${recipientId}`,
            title: `Yêu cầu xác nhận hoàn trả thiết bị (${shortCode})`,
            body: 'Đối tác đã gửi xác nhận hoàn trả thiết bị. Vui lòng kiểm tra tình trạng và xác nhận để hoàn tất giao dịch.',
            targetUrl,
          });
          createdList.push(res.notification);
          break;
        }

        case 'booking.completed': {
          // Notify BOTH Renter and Owner when booking completes
          const [renterRes, ownerRes] = await Promise.all([
            this.createIdempotentNotification({
              recipientId: renterId,
              actorId,
              bookingId,
              gearId,
              type: NotificationType.BOOKING_COMPLETED,
              dedupeKey: `booking:${bookingId}:completed:${renterId}`,
              title: `Giao dịch ${shortCode} hoàn tất!`,
              body: 'Thiết bị đã được hoàn trả thành công. Hãy gửi đánh giá uy tín (1-5 sao) cho chủ thiết bị nhé!',
              targetUrl,
            }),
            this.createIdempotentNotification({
              recipientId: ownerId,
              actorId,
              bookingId,
              gearId,
              type: NotificationType.BOOKING_COMPLETED,
              dedupeKey: `booking:${bookingId}:completed:${ownerId}`,
              title: `Giao dịch ${shortCode} hoàn tất!`,
              body: 'Bạn đã nhận lại thiết bị thành công. Hãy gửi đánh giá uy tín (1-5 sao) cho người thuê nhé!',
              targetUrl,
            }),
          ]);
          createdList.push(renterRes.notification, ownerRes.notification);
          break;
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to process booking notification for ${bookingId}: ${String(err)}`,
      );
      throw err;
    }

    return createdList;
  }

  async processBookingEventWithOutbox(
    payload: BookingDomainEventPayload,
  ): Promise<Record<string, any>[]> {
    const outboxFilter = payload.outboxId
      ? { _id: new Types.ObjectId(payload.outboxId) }
      : {
          transitionKey: BookingEventsService.buildTransitionKey(payload),
        };

    try {
      const notifications = await this.handleBookingDomainEvent(payload);
      if (this.outboxModel) {
        await this.outboxModel.updateOne(outboxFilter, {
          $set: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lastError: undefined,
          },
        });
      }
      return notifications;
    } catch (err) {
      if (this.outboxModel) {
        try {
          const existing = await this.outboxModel.findOne(outboxFilter).lean();
          const nextAttempts = (existing?.attempts || 0) + 1;
          await this.outboxModel.updateOne(outboxFilter, {
            $set: {
              status: nextAttempts >= 10 ? 'FAILED' : 'PENDING',
              attempts: nextAttempts,
              nextAttemptAt: new Date(
                Date.now() + Math.min(60_000, nextAttempts * 5000),
              ),
              lastError: String(err).slice(0, 500),
            },
          });
        } catch {
          // ignore outbox update error
        }
      }
      return [];
    }
  }

  async recoverPendingOutboxEvents(limit = 50): Promise<number> {
    if (!this.outboxModel || this.isRecoveringOutbox) return 0;
    this.isRecoveringOutbox = true;
    let recovered = 0;

    try {
      const now = new Date();
      const pending = await this.outboxModel
        .find({
          status: 'PENDING',
          nextAttemptAt: { $lte: now },
        })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean();

      for (const item of pending) {
        await this.processBookingEventWithOutbox({
          event: item.eventType as any,
          bookingId: String(item.bookingId),
          gearId: String(item.gearId),
          renterId: String(item.renterId),
          ownerId: String(item.ownerId),
          actorId: String(item.actorId),
          occurredAt: new Date(item.occurredAt || Date.now()).toISOString(),
          outboxId: String(item._id),
          transitionKey: item.transitionKey,
          metadata: item.metadata || {},
        });
        recovered += 1;
      }
    } catch (err) {
      this.logger.warn(`Outbox recovery sweep warning: ${String(err)}`);
    } finally {
      this.isRecoveringOutbox = false;
    }

    return recovered;
  }

  async getMyNotifications(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<Record<string, any>> {
    const recipientObjId = new Types.ObjectId(String(userId));
    const filter: Record<string, any> = { recipientId: recipientObjId };
    if (query.unreadOnly === 'true') {
      filter.isRead = false;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({
        recipientId: recipientObjId,
        isRead: false,
      }),
    ]);

    return {
      items: items.map((n: any) => this.formatNotification(n)),
      total,
      unreadCount,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationModel.countDocuments({
      recipientId: new Types.ObjectId(String(userId)),
      isRead: false,
    });
    return { unreadCount };
  }

  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    const notification = await this.notificationModel
      .findById(notificationId)
      .lean();
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (String(notification.recipientId) !== String(userId)) {
      throw new ForbiddenException(
        'Bạn không có quyền xem hoặc đánh dấu thông báo của người dùng khác',
      );
    }

    const now = new Date();
    const updated = await this.notificationModel
      .findByIdAndUpdate(
        notificationId,
        {
          $set: {
            isRead: true,
            readAt: notification.readAt || now,
          },
        },
        { new: true },
      )
      .lean();

    const { unreadCount } = await this.getUnreadCount(userId);
    return {
      notification: this.formatNotification(updated),
      unreadCount,
    };
  }

  async markAllAsRead(
    userId: string,
  ): Promise<{ markedCount: number; unreadCount: number }> {
    const now = new Date();
    const res = await this.notificationModel.updateMany(
      {
        recipientId: new Types.ObjectId(String(userId)),
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: now,
        },
      },
    );

    return {
      markedCount: res.modifiedCount || 0,
      unreadCount: 0,
    };
  }

  private formatNotification(n: any): Record<string, any> {
    if (!n) return {};
    return {
      id: String(n._id),
      recipientId: String(n.recipientId),
      actorId: n.actorId ? String(n.actorId) : undefined,
      bookingId: n.bookingId ? String(n.bookingId) : undefined,
      gearId: n.gearId ? String(n.gearId) : undefined,
      type: n.type,
      dedupeKey: n.dedupeKey,
      title: n.title,
      body: n.body,
      targetUrl: n.targetUrl,
      isRead: Boolean(n.isRead),
      readAt: n.readAt || null,
      createdAt: n.createdAt,
    };
  }
}
