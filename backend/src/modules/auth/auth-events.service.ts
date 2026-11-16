import { Injectable, Logger } from '@nestjs/common';

export type SessionRevocationReason =
  | 'LOGOUT'
  | 'REVOKE_ALL'
  | 'PASSWORD_CHANGED'
  | 'ACCOUNT_LOCKED';

export interface SessionRevocationEvent {
  userId: string;
  sessionId?: string;
  reason: SessionRevocationReason;
  occurredAt: string;
}

@Injectable()
export class AuthEventsService {
  private readonly logger = new Logger(AuthEventsService.name);
  private readonly listeners: Array<
    (event: SessionRevocationEvent) => void | Promise<void>
  > = [];

  onSessionRevoked(
    listener: (event: SessionRevocationEvent) => void | Promise<void>,
  ): void {
    this.listeners.push(listener);
  }

  emitSessionRevoked(params: {
    userId: string;
    sessionId?: string;
    reason: SessionRevocationReason;
  }): void {
    const event: SessionRevocationEvent = {
      userId: String(params.userId),
      sessionId: params.sessionId,
      reason: params.reason,
      occurredAt: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        void listener(event);
      } catch (err) {
        this.logger.warn(
          `Session revocation listener error: ${String(err)}`,
        );
      }
    }
  }
}
