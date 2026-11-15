import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ActivityType,
  ChecklistPriority,
  ExperienceLevel,
} from '../../common/enums/system.enums';

export type AiConversationStatus =
  | 'NEEDS_INFORMATION'
  | 'READY_FOR_CHECKLIST'
  | 'COMPLETED';

export type AiIntentType =
  | 'PREPARE_TRIP'
  | 'FIND_RENTAL_GEAR'
  | 'GENERAL_QA';

export interface ValidatedTripState {
  intent: AiIntentType | null;
  destination: string | null;
  route: string | null;
  activity: ActivityType | null;
  departureDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  travelers: number | null;
  experienceLevel: ExperienceLevel | null;
  ownedGear: string[];
  ownedGearQuantities?: Record<string, number>;
  requiredGearQuantities?: Record<string, number>;
  removedGearCodes?: string[];
  customGearItems?: Array<{
    categoryCode: string;
    itemName: string;
    quantityRequired: number;
    unit?: string;
  }>;
  budgetVnd: number | null;
  pickupArea: string | null;
  wantsToRent: boolean;
  notes: string | null;
  ambiguousFields?: string[];
}

export type AiConversationDocument = AiConversation & Document;

@Schema({ collection: 'ai_conversations', timestamps: true })
export class AiConversation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 'Tư vấn chuyến đi mới' })
  title: string;

  @Prop({
    type: String,
    enum: ['NEEDS_INFORMATION', 'READY_FOR_CHECKLIST', 'COMPLETED'],
    default: 'NEEDS_INFORMATION',
    index: true,
  })
  status: AiConversationStatus;

  @Prop({ type: Number, default: 0 })
  stateVersion: number;

  @Prop({ type: Object, default: {} })
  tripState: ValidatedTripState;

  @Prop({ type: Object, default: {} })
  parsedRequirements: Record<string, unknown>;

  @Prop({ type: [String], default: ['destination', 'activity', 'durationDays', 'travelers'] })
  missingFields: string[];

  @Prop({ type: String, default: null })
  nextQuestion: string | null;

  @Prop({ type: String, default: '' })
  lastMessagePreview: string;

  @Prop({ type: Date, default: () => new Date(), index: true })
  lastMessageAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'TravelPlan' })
  travelPlanId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Checklist' })
  checklistId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AiConversationSchema =
  SchemaFactory.createForClass(AiConversation);
AiConversationSchema.index({ userId: 1, lastMessageAt: -1 });

export type AiMessageDocument = AiMessage & Document;

@Schema({ collection: 'ai_messages', timestamps: true })
export class AiMessage {
  @Prop({
    type: Types.ObjectId,
    ref: 'AiConversation',
    required: true,
    index: true,
  })
  aiConversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  role: 'user' | 'assistant' | 'system';

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, trim: true })
  clientMessageId?: string;

  @Prop({ type: Types.ObjectId, ref: 'AiMessage' })
  replyToMessageId?: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  stateVersion?: number;

  @Prop({ type: Object })
  structuredPayload?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AiMessageSchema = SchemaFactory.createForClass(AiMessage);
AiMessageSchema.index({ aiConversationId: 1, createdAt: 1 });
AiMessageSchema.index(
  { aiConversationId: 1, role: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientMessageId: { $type: 'string' },
    },
  },
);

export type TravelPlanDocument = TravelPlan & Document;

@Schema({ collection: 'travel_plans', timestamps: true })
export class TravelPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiConversation', index: true })
  aiConversationId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  destination: string;

  @Prop({ type: String, default: null })
  route?: string | null;

  @Prop({ type: String, enum: ActivityType, required: true })
  activity: ActivityType;

  @Prop()
  departureDate?: Date;

  @Prop({ required: true, min: 1, default: 1 })
  durationDays: number;

  @Prop({ required: true, min: 1, default: 1 })
  travelers: number;

  @Prop({
    type: String,
    enum: ExperienceLevel,
    default: ExperienceLevel.BEGINNER,
  })
  experienceLevel: ExperienceLevel;

  @Prop({ min: 0, default: 0 })
  budgetVnd: number;

  @Prop({ type: String, default: null })
  pickupArea?: string | null;

  @Prop({ type: [String], default: [] })
  ownedGearCodes: string[];

  @Prop({ type: Object, default: {} })
  ownedGearQuantities?: Record<string, number>;

  @Prop({ type: Object, default: {} })
  requiredGearQuantities?: Record<string, number>;

  @Prop({ type: [String], default: [] })
  removedGearCodes?: string[];

  @Prop({ type: [Object], default: [] })
  customGearItems?: Array<{
    categoryCode: string;
    itemName: string;
    quantityRequired: number;
    unit?: string;
  }>;

  @Prop({ type: Boolean, default: false })
  wantsToRent?: boolean;

  @Prop({ type: Number, default: 1, min: 1 })
  planVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TravelPlanSchema = SchemaFactory.createForClass(TravelPlan);

@Schema({ _id: false })
export class ChecklistEntry {
  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true })
  categoryCode: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 1 })
  quantityRequired: number;

  @Prop({ required: true, min: 1 })
  quantityNeeded: number;

  @Prop({ required: true, min: 0, default: 0 })
  quantityOwned: number;

  @Prop({ required: true, min: 0 })
  quantityMissing: number;

  @Prop({ default: 'chiếc' })
  unit: string;

  @Prop({
    type: String,
    enum: ChecklistPriority,
    default: ChecklistPriority.ESSENTIAL,
  })
  priority: ChecklistPriority;

  @Prop({ default: true })
  canRent: boolean;

  @Prop({ default: true })
  isRentable: boolean;

  @Prop({ type: Object, default: {} })
  requiredAttributes: Record<string, any>;

  @Prop({ default: true })
  ownedConfirmed: boolean;

  @Prop({ default: false })
  userEditedOwned?: boolean;

  @Prop({ default: false })
  userEditedRequired?: boolean;

  @Prop({ default: false })
  isCustomItem?: boolean;

  @Prop({ default: '' })
  note: string;

  @Prop({ default: '' })
  reason: string;
}

export type ChecklistDocument = Checklist & Document;

export interface ChecklistVersionChange {
  version: number;
  scope: 'ITEM' | 'GLOBAL';
  itemKeys?: string[];
  action?: string;
}

@Schema({ collection: 'checklists', timestamps: true })
export class Checklist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TravelPlan', index: true })
  travelPlanId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiConversation', index: true })
  aiConversationId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: Number, default: 1, min: 1 })
  planVersion: number;

  @Prop({ type: Number, default: 1, min: 1 })
  checklistVersion: number;

  @Prop({ type: [String], default: [] })
  removedItemCodes?: string[];

  @Prop({ type: [ChecklistEntry], default: [] })
  items: ChecklistEntry[];

  @Prop({ type: [Object], default: [] })
  versionHistory?: ChecklistVersionChange[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChecklistSchema = SchemaFactory.createForClass(Checklist);

export type GearRuleDocument = GearRule & Document;

@Schema({ collection: 'gear_rules', timestamps: true })
export class GearRule {
  @Prop({ type: String, enum: ActivityType, required: true, index: true })
  activity: ActivityType;

  @Prop({ required: true, uppercase: true })
  categoryCode: string;

  @Prop({ required: true })
  itemName: string;

  @Prop({
    type: String,
    enum: ChecklistPriority,
    default: ChecklistPriority.ESSENTIAL,
  })
  priority: ChecklistPriority;

  @Prop({ default: 'PER_PERSON' })
  scalingRule: 'PER_PERSON' | 'SHARED_2_3' | 'ONE_PER_GROUP';

  @Prop({ default: true })
  isRentable: boolean;

  @Prop({ default: '' })
  reasonTemplate: string;
}

export const GearRuleSchema = SchemaFactory.createForClass(GearRule);
GearRuleSchema.index({ activity: 1, categoryCode: 1 }, { unique: true });
