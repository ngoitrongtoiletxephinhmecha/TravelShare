import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  AccountStatus,
  ExperienceLevel,
  UserRole,
} from '../../common/enums/system.enums';

export type UserDocument = User & Document;

@Schema({ _id: false })
export class RefreshSession {
  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  userAgent?: string;
}

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
    index: true,
  })
  role: UserRole;

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
    index: true,
  })
  status: AccountStatus;

  @Prop({ sparse: true, index: true })
  googleId?: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ select: false })
  resetPasswordTokenHash?: string;

  @Prop({ select: false })
  resetPasswordExpiresAt?: Date;

  @Prop({ type: [RefreshSession], default: [], select: false })
  refreshSessions: RefreshSession[];

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

export type ProfileDocument = Profile & Document;

@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ type: [Number], default: [105.8342, 21.0278] }) // [lng, lat] default Ha Noi
  coordinates: number[];
}

@Schema({ collection: 'profiles', timestamps: true })
export class Profile {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  username: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '' })
  coverUrl: string;

  @Prop({ maxlength: 500, default: '' })
  bio: string;

  @Prop({ trim: true, default: 'Hà Nội, Việt Nam' })
  city: string;

  @Prop({ type: GeoPoint, default: () => ({ type: 'Point', coordinates: [105.8342, 21.0278] }) })
  location: GeoPoint;

  @Prop({
    type: String,
    enum: ExperienceLevel,
    default: ExperienceLevel.BEGINNER,
  })
  experienceLevel: ExperienceLevel;

  @Prop({ type: [String], default: [] })
  favoriteActivities: string[];

  @Prop({ default: 0, min: 0 })
  followersCount: number;

  @Prop({ default: 0, min: 0 })
  followingCount: number;

  @Prop({ default: 5.0, min: 0, max: 5 })
  trustScore: number;

  @Prop({ default: 0, min: 0 })
  completedBookingsCount: number;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
ProfileSchema.index({ location: '2dsphere' });

export type FollowDocument = Follow & Document;

@Schema({ collection: 'follows', timestamps: true })
export class Follow {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  followerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  followingId: Types.ObjectId;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
