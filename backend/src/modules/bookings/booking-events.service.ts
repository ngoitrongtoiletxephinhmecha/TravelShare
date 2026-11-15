import { Injectable, Logger } from '@nestjs/common';

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
  metadata?: Record<string, any>;
}

/**
 * Internal domain event emitter for Phase 4 booking transitions.
 * Ready for Phase 5 Notification/Socket consumers to subscribe to without faking sent notifications.
 */
@Injectable()
export class BookingEventsService {
  private readonly logger = new Logger(BookingEventsService.name);
  private readonly listeners: Array<
    (payload: BookingDomainEventPayload) => void | Promise<void>
  > = [];
  private readonly recentEvents: BookingDomainEventPayload[] = [];

  onEvent(
    listener: (payload: BookingDomainEventPayload) => void | Promise<void>,
  ): void {
    this.listeners.push(listener);
  }

  emit(payload: BookingDomainEventPayload): void {
    this.recentEvents.push(payload);
    if (this.recentEvents.length > 200) {
      this.recentEvents.shift();
    }
    this.logger.debug(
      `[DomainEvent] ${payload.event} (bookingId=${payload.bookingId})`,
    );
    for (const listener of this.listeners) {
      try {
        void listener(payload);
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
