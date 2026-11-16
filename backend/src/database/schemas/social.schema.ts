import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ActivityType,
  CommunityRole,
  ReactionType,
} from '../../common/enums/system.enums';

export type PostDocument = Post & Document;

@Schema({ collection: 'posts', timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', index: true })
  communityId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  content: string;

  @Prop({ type: [String], default: [] })
  mediaUrls: string[];

  @Prop({ type: [String], default: [], index: true })
  hashtags: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentions: Types.ObjectId[];

  @Prop({ trim: true })
  locationName?: string;

  @Prop({ type: String, enum: ActivityType, index: true })
  activityType?: ActivityType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'GearItem' }], default: [] })
  gearTags: Types.ObjectId[];

  @Prop({ default: 0, min: 0 })
  likesCount: number;

  @Prop({ default: 0, min: 0 })
  commentsCount: number;

  @Prop({ default: 0, min: 0 })
  sharesCount: number;

  @Prop({ default: false, index: true })
  isFeatured: boolean;

  @Prop({ default: false, index: true })
  isDemo: boolean;

  @Prop({ default: false, index: true })
  isHidden: boolean;

  @Prop({ trim: true, maxlength: 500 })
  hiddenReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  hiddenById?: Types.ObjectId;

  @Prop()
  hiddenAt?: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ createdAt: -1, _id: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ communityId: 1, isHidden: 1, createdAt: -1 });
PostSchema.index({ content: 'text', locationName: 'text', hashtags: 'text' });

export type CommentDocument = Comment & Document;

@Schema({ collection: 'comments', timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  parentCommentId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  content: string;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ default: false, index: true })
  isHidden: boolean;

  @Prop({ trim: true, maxlength: 500 })
  hiddenReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  hiddenById?: Types.ObjectId;

  @Prop()
  hiddenAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ postId: 1, createdAt: 1 });

export type ReactionDocument = Reaction & Document;

@Schema({ collection: 'reactions', timestamps: true })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ReactionType, default: ReactionType.LIKE })
  type: ReactionType;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);
ReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const PostReaction = Reaction;
export const PostReactionSchema = ReactionSchema;
export type PostReactionDocument = ReactionDocument;

export type SavedPostDocument = SavedPost & Document;

@Schema({ collection: 'saved_posts', timestamps: true })
export class SavedPost {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  postId: Types.ObjectId;
}

export const SavedPostSchema = SchemaFactory.createForClass(SavedPost);
SavedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });

export type MediaAssetDocument = MediaAsset & Document;

@Schema({ collection: 'media_assets', timestamps: true })
export class MediaAsset {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  uploaderId: Types.ObjectId;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  sizeBytes: number;

  @Prop({ required: true, enum: ['IMAGE', 'VIDEO'] })
  mediaType: 'IMAGE' | 'VIDEO';

  @Prop({ required: true, enum: ['local', 'cloudinary'], default: 'local' })
  storageDriver: 'local' | 'cloudinary';

  @Prop({
    required: true,
    enum: ['PUBLIC', 'BOOKING_PARTICIPANTS'],
    default: 'PUBLIC',
    index: true,
  })
  visibility: 'PUBLIC' | 'BOOKING_PARTICIPANTS';

  @Prop({
    required: true,
    enum: ['GENERAL', 'BOOKING_HANDOVER', 'BOOKING_DISPUTE'],
    default: 'GENERAL',
    index: true,
  })
  scope: 'GENERAL' | 'BOOKING_HANDOVER' | 'BOOKING_DISPUTE';

  @Prop({ type: Types.ObjectId, ref: 'Booking', index: true })
  bookingId?: Types.ObjectId;

  @Prop({ required: true })
  url: string;

  @Prop()
  publicId?: string;

  @Prop()
  storageKey?: string;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);

export type CommunityDocument = Community & Document;

@Schema({ collection: 'communities', timestamps: true })
export class Community {
  @Prop({ required: true, unique: true, trim: true, index: true })
  slug: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, maxlength: 2000 })
  description: string;

  @Prop({ default: '' })
  coverUrl: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ type: String, enum: ActivityType, default: ActivityType.TREKKING })
  activityType: ActivityType;

  @Prop({ type: [String], default: [] })
  rules: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ default: 1, min: 0 })
  membersCount: number;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: false })
  isDemo: boolean;
}

export const CommunitySchema = SchemaFactory.createForClass(Community);

export type CommunityMemberDocument = CommunityMember & Document;

@Schema({ collection: 'community_members', timestamps: true })
export class CommunityMember {
  @Prop({
    type: Types.ObjectId,
    ref: 'Community',
    required: true,
    index: true,
  })
  communityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: CommunityRole,
    default: CommunityRole.MEMBER,
  })
  role: CommunityRole;
}

export const CommunityMemberSchema =
  SchemaFactory.createForClass(CommunityMember);
CommunityMemberSchema.index({ communityId: 1, userId: 1 }, { unique: true });
