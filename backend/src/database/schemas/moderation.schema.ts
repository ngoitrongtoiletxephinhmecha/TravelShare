import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  DisputeReason,
  DisputeStatus,
  ReportStatus,
  ReportTargetType,
} from '../../common/enums/system.enums';

export type ReportDocument = Report & Document;

@Schema({ collection: 'reports', timestamps: true })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  @Prop({ type: String, enum: ReportTargetType, required: true, index: true })
  targetType: ReportTargetType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', index: true })
  communityId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 500 })
  reason: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  description?: string;

  @Prop({
    type: String,
    enum: ReportStatus,
    default: ReportStatus.PENDING,
    index: true,
  })
  status: ReportStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedByAdminId?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  resolutionNote?: string;

  @Prop({ trim: true, maxlength: 2000 })
  internalNote?: string;

  @Prop({ trim: true, maxlength: 1000 })
  publicOutcome?: string;

  @Prop({ trim: true, maxlength: 100 })
  actionTaken?: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1, status: 1 });
ReportSchema.index({ communityId: 1, status: 1, createdAt: -1 });

export type ModerationAuditLogDocument = ModerationAuditLog & Document;

@Schema({ collection: 'moderation_audit_logs', timestamps: true })
export class ModerationAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  actorRole: string;

  @Prop({ required: true, enum: ['SYSTEM', 'COMMUNITY'], default: 'SYSTEM', index: true })
  scope: 'SYSTEM' | 'COMMUNITY';

  @Prop({ type: Types.ObjectId, ref: 'Community', index: true })
  communityId?: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  targetType: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  action: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  reason: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;
}

export const ModerationAuditLogSchema =
  SchemaFactory.createForClass(ModerationAuditLog);
ModerationAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
ModerationAuditLogSchema.index({ createdAt: -1 });

export type DisputeDocument = Dispute & Document;

@Schema({ collection: 'disputes', timestamps: true })
export class Dispute {
  @Prop({
    type: Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true,
  })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reportedUserId: Types.ObjectId;

  @Prop({
    type: String,
    enum: DisputeReason,
    default: DisputeReason.OTHER,
    required: true,
  })
  reason: DisputeReason;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description: string;

  @Prop({ type: [String], default: [] })
  evidence: string[];

  @Prop({
    type: String,
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
    index: true,
  })
  status: DisputeStatus;

  @Prop({ maxlength: 2000 })
  adminNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedByAdminId?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);
DisputeSchema.index({ bookingId: 1, reporterId: 1 }, { unique: true });
