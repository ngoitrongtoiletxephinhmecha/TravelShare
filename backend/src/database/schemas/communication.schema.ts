import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationType } from '../../common/enums/system.enums';

export interface ConversationContextCard {
  type: 'GEAR' | 'BOOKING';
  refId: string;
  title: string;
  subtitle: string;
  status?: string;
  imageUrl?: string;
  targetUrl: string;
}

export interface ParticipantReadReceipt {
  lastReadMessageId?: string;
  lastReadAt: Date;
}

export type ConversationDocument = Conversation & Document;

@Schema({ collection: 'conversations', timestamps: true })
export class Conversation {
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    required: true,
    index: true,
  })
  participants: Types.ObjectId[];

  @Prop({ required: true, unique: true, trim: true })
  participantPairKey: string;

  @Prop({ type: Types.ObjectId, ref: 'Booking', index: true })
  bookingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GearItem', index: true })
  gearId?: Types.ObjectId;

  @Prop({ type: Object, default: null })
  activeContext?: ConversationContextCard | null;

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessageId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastMessageSenderId?: Types.ObjectId;

  @Prop({ default: '' })
  lastMessagePreview: string;

  @Prop({ default: Date.now, index: true })
  lastMessageAt: Date;

  @Prop({ type: Object, default: {} })
  readReceipts: Record<string, ParticipantReadReceipt>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

export type MessageDocument = Message & Document;

@Schema({ collection: 'messages', timestamps: true })
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  clientMessageId: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  content: string;

  @Prop({ type: Object, default: null })
  contextCard?: ConversationContextCard | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  readBy: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, _id: -1 });
MessageSchema.index(
  { conversationId: 1, senderId: 1, clientMessageId: 1 },
  { unique: true },
);

export type NotificationDocument = Notification & Document;

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Booking', index: true })
  bookingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GearItem' })
  gearId?: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true, index: true })
  type: NotificationType;

  @Prop({ required: true, unique: true, trim: true })
  dedupeKey: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: '' })
  targetUrl: string;

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, createdAt: -1 });

export type OutboxEventDocument = OutboxEvent & Document;

@Schema({ collection: 'outbox_events', timestamps: true })
export class OutboxEvent {
  @Prop({ required: true, trim: true, index: true })
  eventType: string;

  @Prop({ required: true, unique: true, trim: true })
  transitionKey: string;

  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GearItem', required: true })
  gearId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  renterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true, default: Date.now })
  occurredAt: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({
    required: true,
    enum: ['PENDING', 'PROCESSED', 'FAILED'],
    default: 'PENDING',
    index: true,
  })
  status: 'PENDING' | 'PROCESSED' | 'FAILED';

  @Prop({ default: 0, min: 0 })
  attempts: number;

  @Prop({ default: Date.now, index: true })
  nextAttemptAt: Date;

  @Prop()
  processedAt?: Date;

  @Prop()
  lastError?: string;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
OutboxEventSchema.index({ status: 1, nextAttemptAt: 1 });
