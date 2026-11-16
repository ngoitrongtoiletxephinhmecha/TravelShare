import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from '../../database/schemas';

export type BookingDomainEventName =
  | 'booking.requested'
  | 'booking.approved'
  | 'booking.rejected'
  | 'booking.cancelled'
  | 'booking.handed_over'
  | 'booking.returned'
  | 'booking.completed';

export interface BookingDomainEventPayload {
  event: BookingDomainEventName;
  bookingId: string;
  gearId: string;
  renterId: string;
  ownerId: string;
  actorId: string;
  occurredAt: string;
  outboxId?: string;
  transitionKey?: string;
  metadata?: Record<string, any>;
}

/**
 * Transactional Outbox + internal domain event dispatcher for booking transitions.
 */
@Injectable()
export class BookingEventsService {
  private readonly logger = new Logger(BookingEventsService.name);
  private readonly listeners: Array<
    (payload: BookingDomainEventPayload) => void | Promise<void>
  > = [];
  private readonly recentEvents: BookingDomainEventPayload[] = [];

  constructor(
    @Optional()
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel?: Model<OutboxEventDocument>,
  ) {}

  static buildTransitionKey(payload: BookingDomainEventPayload): string {
    if (payload.transitionKey) return payload.transitionKey;
    const shortEvent = payload.event.replace(/^booking\./, '');
    if (payload.event === 'booking.handed_over' && payload.metadata?.stage) {
      return `booking:${payload.bookingId}:${shortEvent}:${String(payload.metadata.stage)}`;
    }
    return `booking:${payload.bookingId}:${shortEvent}`;
  }

  onEvent(
    listener: (payload: BookingDomainEventPayload) => void | Promise<void>,
  ): void {
    this.listeners.push(listener);
  }

  /**
   * Persist durable outbox event (within caller's MongoDB transaction session when provided).
   */
  async recordOutbox(
    payload: BookingDomainEventPayload,
    session?: ClientSession | null,
  ): Promise<BookingDomainEventPayload> {
    const transitionKey = BookingEventsService.buildTransitionKey(payload);
    const enriched: BookingDomainEventPayload = {
      ...payload,
      transitionKey,
    };

    if (
      !this.outboxModel ||
      !Types.ObjectId.isValid(payload.bookingId) ||
      !Types.ObjectId.isValid(payload.gearId) ||
      !Types.ObjectId.isValid(payload.renterId) ||
      !Types.ObjectId.isValid(payload.ownerId)
    ) {
      return enriched;
    }

    const doc = {
      eventType: payload.event,
      transitionKey,
      bookingId: new Types.ObjectId(payload.bookingId),
      gearId: new Types.ObjectId(payload.gearId),
      renterId: new Types.ObjectId(payload.renterId),
      ownerId: new Types.ObjectId(payload.ownerId),
      actorId: String(payload.actorId),
      occurredAt: new Date(payload.occurredAt || Date.now()),
      metadata: payload.metadata || {},
      status: 'PENDING' as const,
      attempts: 0,
      nextAttemptAt: new Date(),
    };

    try {
      if (session) {
        const createdArr = await this.outboxModel.create([doc], { session });
        if (createdArr?.[0]?._id) {
          enriched.outboxId = String(createdArr[0]._id);
        }
      } else {
        const created = await this.outboxModel.create(doc);
        if (created?._id) {
          enriched.outboxId = String(created._id);
        }
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        // Idempotent transition key already persisted
        const q = this.outboxModel.findOne({ transitionKey });
        if (session && typeof (q as any).session === 'function') {
          (q as any).session(session);
        }
        const existing = await q.lean();
        if (existing?._id) {
          enriched.outboxId = String(existing._id);
        }
        return enriched;
      }
      throw err;
    }

    return enriched;
  }

  /**
   * Persist durable outbox record and trigger immediate async processing.
   */
  async recordAndDispatch(payload: BookingDomainEventPayload): Promise<void> {
    const recorded = await this.recordOutbox(payload);
    this.emit(recorded);
  }

  emit(payload: BookingDomainEventPayload): void {
    const transitionKey = BookingEventsService.buildTransitionKey(payload);
    const enriched = payload.transitionKey
      ? payload
      : { ...payload, transitionKey };

    this.recentEvents.push(enriched);
    if (this.recentEvents.length > 200) {
      this.recentEvents.shift();
    }
    this.logger.debug(
      `[DomainEvent] ${enriched.event} (bookingId=${enriched.bookingId}, key=${transitionKey})`,
    );
    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(enriched)).catch((err) => {
          this.logger.warn(`Domain event listener async error: ${String(err)}`);
        });
      } catch (err) {
        this.logger.warn(`Domain event listener error: ${String(err)}`);
      }
    }
  }

  getRecentEvents(bookingId?: string): BookingDomainEventPayload[] {
    if (!bookingId) return [...this.recentEvents];
    return this.recentEvents.filter((e) => e.bookingId === bookingId);
  }
}
