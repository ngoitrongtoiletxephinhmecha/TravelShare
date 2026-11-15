import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  BookingStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  HandoverType,
} from '../../common/enums/system.enums';
import { GeoPoint } from './user-profile.schema';

export interface CategoryAttributeField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  unit?: string;
  options?: string[];
  required?: boolean;
}

export type GearCategoryDocument = GearCategory & Document;

@Schema({ collection: 'gear_categories', timestamps: true })
export class GearCategory {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 'Tent' })
  icon: string;

  @Prop({ default: 'Tent' })
  iconName: string;

  @Prop({ type: Types.ObjectId, ref: 'GearCategory', default: null })
  parentCategoryId?: Types.ObjectId | null;

  @Prop({ type: Array, default: [] })
  attributesSchema: CategoryAttributeField[];

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const GearCategorySchema = SchemaFactory.createForClass(GearCategory);

@Schema({ _id: false })
export class GearAvailabilitySettings {
  @Prop({ default: 1, min: 1 })
  minRentalDays: number;

  @Prop({ default: 14, min: 1 })
  maxRentalDays: number;

  @Prop({ default: 4, min: 0 })
  advanceNoticeHours: number;
}

export type GearItemDocument = GearItem & Document;

@Schema({ collection: 'gear_items', timestamps: true })
export class GearItem {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'GearCategory',
    index: true,
  })
  categoryId?: Types.ObjectId;

  @Prop({ required: true, uppercase: true, index: true })
  categoryCode: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, maxlength: 4000 })
  description: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({
    type: String,
    enum: GearCondition,
    default: GearCondition.GOOD,
    index: true,
  })
  condition: GearCondition;

  @Prop({ trim: true, default: '' })
  brand: string;

  @Prop({ type: Object, default: {} })
  attributes: Record<string, string | number | boolean>;

  @Prop({ required: true, min: 1, default: 1 })
  totalQuantity: number;

  @Prop({ default: 0 })
  reservationVersion: number;

  @Prop({
    type: String,
    enum: GearListingType,
    default: GearListingType.RENT,
    index: true,
  })
  sharingType: GearListingType;

  @Prop({
    type: String,
    enum: GearListingType,
    default: GearListingType.RENT,
  })
  listingType: GearListingType;

  @Prop({ required: true, min: 0, default: 0, index: true })
  pricePerDay: number;

  @Prop({ required: true, min: 0, default: 0 })
  dailyPriceVnd: number;

  @Prop({ required: true, min: 0, default: 0 })
  depositAmount: number;

  @Prop({ required: true, min: 0, default: 0 })
  depositAmountVnd: number;

  @Prop({ required: true, trim: true, index: true })
  city: string;

  @Prop({ required: true, trim: true })
  district: string;

  @Prop({ type: GeoPoint, required: true })
  pickupLocation: GeoPoint;

  @Prop({ type: [String], default: [] })
  usageRules: string[];

  @Prop({
    type: GearAvailabilitySettings,
    default: () => ({
      minRentalDays: 1,
      maxRentalDays: 14,
      advanceNoticeHours: 4,
    }),
  })
  availabilitySettings: GearAvailabilitySettings;

  @Prop({
    type: String,
    enum: GearStatus,
    default: GearStatus.ACTIVE,
    index: true,
  })
  status: GearStatus;

  @Prop({
    type: String,
    enum: GearModerationStatus,
    default: GearModerationStatus.APPROVED,
    index: true,
  })
  moderationStatus: GearModerationStatus;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: 5.0, min: 0, max: 5 })
  ratingAvg: number;

  @Prop({ default: 0, min: 0 })
  ratingCount: number;

  @Prop({ default: false, index: true })
  isDemo: boolean;
}

export const GearItemSchema = SchemaFactory.createForClass(GearItem);
GearItemSchema.index({ pickupLocation: '2dsphere' });
GearItemSchema.index({ ownerId: 1, status: 1 });
GearItemSchema.index({ categoryCode: 1, status: 1, moderationStatus: 1 });
GearItemSchema.index({ pricePerDay: 1, createdAt: -1 });
GearItemSchema.index({ title: 'text', description: 'text', brand: 'text' });

export type GearAvailabilityDocument = GearAvailability & Document;

@Schema({ collection: 'gear_availability', timestamps: true })
export class GearAvailability {
  @Prop({ type: Types.ObjectId, ref: 'GearItem', required: true, index: true })
  gearId: Types.ObjectId;

  @Prop({ required: true, index: true })
  startAt: Date;

  @Prop({ required: true, index: true })
  endAt: Date;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1, default: 1 })
  reservedQuantity: number;

  @Prop({ type: Types.ObjectId, ref: 'Booking', index: true })
  bookingId?: Types.ObjectId;

  @Prop({ default: 'OWNER_BLOCKED' })
  reason: 'BOOKED' | 'OWNER_BLOCKED';

  @Prop({ default: '' })
  note: string;
}

export const GearAvailabilitySchema =
  SchemaFactory.createForClass(GearAvailability);
GearAvailabilitySchema.index({ gearId: 1, startAt: 1, endAt: 1 });

export interface BookingPickupLocationSnapshot {
  city: string;
  district: string;
  coordinates: number[];
  gearTitle: string;
  brand?: string;
  condition: string;
  usageRules: string[];
  images: string[];
}

export interface BookingAuditEntry {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorId: string;
  actorRole: string;
  note?: string;
  timestamp: Date;
}

export type BookingDocument = Booking & Document;

@Schema({ collection: 'bookings', timestamps: true })
export class Booking {
  @Prop({ type: Types.ObjectId, ref: 'GearItem', required: true, index: true })
  gearId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  renterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ required: true, index: true })
  startAt: Date;

  @Prop({ required: true, index: true })
  endAt: Date;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1 })
  rentalDays: number;

  @Prop({ required: true, min: 1 })
  totalDays: number;

  @Prop({
    type: String,
    enum: GearListingType,
    default: GearListingType.RENT,
  })
  sharingType: GearListingType;

  @Prop({
    type: String,
    enum: BookingStatus,
    default: BookingStatus.PENDING,
    index: true,
  })
  status: BookingStatus;

  @Prop({ required: true, min: 0 })
  priceSnapshot: number;

  @Prop({ required: true, min: 0 })
  unitDailyPriceSnapshotVnd: number;

  @Prop({ required: true, min: 0 })
  rentalTotal: number;

  @Prop({ required: true, min: 0 })
  totalRentalFeeSnapshotVnd: number;

  @Prop({ required: true, min: 0 })
  depositAmount: number;

  @Prop({ required: true, min: 0 })
  depositSnapshotVnd: number;

  @Prop({ type: Object, required: true })
  pickupLocationSnapshot: BookingPickupLocationSnapshot;

  @Prop({ maxlength: 1000 })
  renterNote?: string;

  @Prop({ maxlength: 1000 })
  ownerResponseNote?: string;

  @Prop({ maxlength: 1000 })
  cancellationReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  handedOverAt?: Date;

  @Prop()
  returnedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ index: true })
  expiresAt?: Date;

  @Prop({ type: Array, default: [] })
  statusHistory: BookingAuditEntry[];

  @Prop({ default: 'MANUAL_CONFIRMATION' })
  paymentMethodNote: string;

  @Prop({ default: false })
  isDemo: boolean;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
BookingSchema.index({ gearId: 1, status: 1, startAt: 1, endAt: 1 });
BookingSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
BookingSchema.index({ renterId: 1, status: 1, createdAt: -1 });
BookingSchema.index({ status: 1, expiresAt: 1 });

export interface HandoverConfirmationEntry {
  userId: string;
  role: 'OWNER' | 'RENTER';
  confirmedAt: Date;
  note?: string;
  photos?: string[];
  condition?: string;
}

export type HandoverDocument = Handover & Document;

@Schema({ collection: 'handovers', timestamps: true })
export class Handover {
  @Prop({
    type: Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true,
  })
  bookingId: Types.ObjectId;

  @Prop({
    type: String,
    enum: HandoverType,
    default: HandoverType.PICKUP,
    required: true,
  })
  handoverType: HandoverType;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({
    type: String,
    enum: GearCondition,
    default: GearCondition.GOOD,
  })
  condition: GearCondition;

  @Prop({ default: '', maxlength: 1500 })
  notes: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  confirmedBy: Types.ObjectId[];

  @Prop({ type: Array, default: [] })
  confirmations: HandoverConfirmationEntry[];
}

export const HandoverSchema = SchemaFactory.createForClass(Handover);
HandoverSchema.index({ bookingId: 1, handoverType: 1 }, { unique: true });

export type ReviewDocument = Review & Document;

@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GearItem', required: true, index: true })
  gearId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reviewerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  targetUserId: Types.ObjectId;

  @Prop({ default: 'RENTER' })
  reviewerRole: 'RENTER' | 'OWNER';

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, trim: true, maxlength: 1500 })
  comment: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ bookingId: 1, reviewerId: 1 }, { unique: true });
