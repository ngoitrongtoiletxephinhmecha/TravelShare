export type UserRole = 'GUEST' | 'USER' | 'ADMIN';
export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type ActivityType =
  | 'TREKKING'
  | 'CAMPING'
  | 'MOTORBIKE_TOUR'
  | 'BACKPACKING'
  | 'MOUNTAINEERING'
  | 'BEACH'
  | 'SIGHTSEEING'
  | 'OTHER';

export type GearCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
export type GearSharingType = 'RENT' | 'FREE_LOAN' | 'BOTH';
export type GearStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'UNAVAILABLE'
  | 'ARCHIVED';

export interface CategoryAttributeField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  unit?: string;
  options?: string[];
  required?: boolean;
}

export interface GearCategoryItem {
  id?: string;
  code: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  iconName: string;
  parentCategoryId?: string | null;
  attributesSchema: CategoryAttributeField[];
  isActive: boolean;
  sortOrder: number;
}

export interface GearOwnerInfo {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  city: string;
  trustScore: number;
}

export interface GearAvailabilityPeriod {
  id: string;
  gearId: string;
  startAt: string;
  endAt: string;
  reservedQuantity: number;
  reason: 'BOOKED' | 'OWNER_BLOCKED';
  note: string;
}

export interface GearAvailabilityResponse {
  gearId: string;
  totalQuantity: number;
  isAvailable: boolean;
  availableQuantity: number;
  requestedInterval?: {
    startAt: string;
    endAt: string;
    rentalDays: number;
    requestedQuantity: number;
  };
  estimatedCostVnd?: {
    pricePerDay: number;
    totalRentalFee: number;
    depositAmount: number;
  };
  conflictingPeriods?: GearAvailabilityPeriod[];
  periods: GearAvailabilityPeriod[];
}

export interface GearItemData {
  id: string;
  ownerId: string;
  owner: GearOwnerInfo;
  categoryCode: string;
  categoryName: string;
  title: string;
  description: string;
  brand: string;
  condition: GearCondition;
  attributes: Record<string, string | number | boolean>;
  images: string[];
  totalQuantity: number;
  sharingType: GearSharingType;
  pricePerDay: number;
  depositAmount: number;
  city: string;
  district: string;
  pickupAreaLabel: string;
  pickupLocation: {
    type: 'Point';
    coordinates: [number, number];
  };
  distanceKm: number | null;
  usageRules: string[];
  availabilitySettings: {
    minRentalDays: number;
    maxRentalDays: number;
    advanceNoticeHours: number;
  };
  status: GearStatus;
  moderationStatus: string;
  ratingAvg: number;
  ratingCount: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GearDetailData extends GearItemData {
  availability: GearAvailabilityResponse;
  similarItems: GearItemData[];
}

export interface PaginatedGearResult {
  items: GearItemData[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UserProfile {
  username: string;
  fullName: string;
  avatarUrl: string;
  coverUrl: string;
  bio: string;
  city: string;
  experienceLevel: ExperienceLevel;
  favoriteActivities: string[];
  followersCount: number;
  followingCount: number;
  trustScore: number;
}

export interface PublicUserProfile extends UserProfile {
  id: string;
  userId: string;
  postsCount: number;
  completedBookingsCount: number;
  isFollowing: boolean;
}

export interface UserConnectionItem {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  city: string;
  bio: string;
  trustScore: number;
  followersCount: number;
  isFollowing: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  profile: UserProfile | null;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
  csrfToken?: string;
  expiresIn: number;
}

export interface PostAuthor {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  city: string;
  trustScore: number;
}

export interface PostGearTag {
  id: string;
  title: string;
  dailyPriceVnd: number;
  categoryCode: string;
  location: string;
  isDemo: boolean;
}

export interface PostItem {
  id: string;
  authorId: string;
  author: PostAuthor;
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  locationName: string | null;
  activityType: ActivityType | null;
  gearTags: PostGearTag[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isFeatured: boolean;
  isDemo: boolean;
  communityId?: string | null;
  community?: {
    id: string;
    slug: string;
    name: string;
    avatarUrl?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPaginatedPosts {
  items: PostItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommentItem {
  id: string;
  postId: string;
  authorId: string;
  parentCommentId: string | null;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    trustScore: number;
  };
}

export interface UploadedMediaItem {
  id: string;
  url: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  storageDriver: 'local' | 'cloudinary';
}

export interface TrendingHashtag {
  tag: string;
  postsCount: number;
}

export interface HealthStatus {
  status: 'OK' | 'DEGRADED' | 'OFFLINE';
  service: string;
  version: string;
  phase: string;
  timezone: string;
  currency: string;
  database: {
    provider: string;
    status: string;
  };
  integrations: {
    googleOAuthConfigured: boolean;
    geminiAiConfigured: boolean;
  };
  serverTime: string;
}

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'IN_USE'
  | 'RETURN_PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export type HandoverType = 'PICKUP' | 'RETURN';

export type DisputeReason =
  | 'DAMAGED_GEAR'
  | 'LATE_RETURN'
  | 'NO_SHOW_DELIVERY'
  | 'MISREPRESENTED_GEAR'
  | 'OTHER';

export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_MEDIATION'
  | 'RESOLVED_FOR_OWNER'
  | 'RESOLVED_FOR_RENTER'
  | 'CLOSED';

export interface BookingAuditEntry {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorId: string;
  actorRole: string;
  note?: string;
  timestamp: string;
}

export interface HandoverConfirmationEntry {
  userId: string;
  role: 'OWNER' | 'RENTER';
  confirmedAt: string;
  note?: string;
  photos?: string[];
  condition?: GearCondition;
}

export interface HandoverRecord {
  id: string;
  bookingId: string;
  handoverType: HandoverType;
  photos: string[];
  condition: GearCondition;
  notes: string;
  confirmedBy: string[];
  confirmations: HandoverConfirmationEntry[];
  createdAt: string;
}

export interface BookingReviewItem {
  id: string;
  bookingId?: string;
  gearId?: string;
  gearTitle?: string;
  reviewerId?: string;
  targetUserId?: string;
  reviewerRole: 'RENTER' | 'OWNER';
  rating: number;
  comment: string;
  createdAt: string;
  reviewer?: {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
  };
}

export interface UserReviewsResponse {
  targetUserId: string;
  ratingAvg: number;
  ratingCount: number;
  items: BookingReviewItem[];
}

export interface DisputeItem {
  id: string;
  bookingId?: string;
  reporterId: string;
  reportedUserId: string;
  reason: DisputeReason;
  description: string;
  evidence: string[];
  status: DisputeStatus;
  adminNotes?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface BookingItem {
  id: string;
  gearId: string;
  renterId: string;
  ownerId: string;
  quantity: number;
  startAt: string;
  endAt: string;
  rentalDays: number;
  sharingType: GearSharingType;
  status: BookingStatus;
  priceSnapshot: number;
  rentalTotal: number;
  depositAmount: number;
  pickupLocationSnapshot: {
    city: string;
    district: string;
    coordinates: [number, number];
    gearTitle: string;
    brand: string;
    condition: GearCondition;
    usageRules: string[];
    images: string[];
  };
  renterNote: string;
  ownerResponseNote: string;
  cancellationReason?: string;
  cancelledBy?: string;
  approvedAt?: string;
  rejectedAt?: string;
  handedOverAt?: string;
  returnedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  statusHistory: BookingAuditEntry[];
  hasViewerReviewed: boolean;
  createdAt: string;
  updatedAt: string;
  owner: GearOwnerInfo;
  renter: GearOwnerInfo;
}

export interface BookingDetailData extends BookingItem {
  handovers: HandoverRecord[];
  reviews: BookingReviewItem[];
  disputes: DisputeItem[];
}

export interface PaginatedBookingsResult {
  items: BookingItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =========================================================================
// PHASE 5: REALTIME CHAT & TRANSACTION NOTIFICATIONS
// =========================================================================

export interface ConversationContextCard {
  type: 'GEAR' | 'BOOKING';
  referenceId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  status?: string;
  targetUrl: string;
}

export interface ConversationParticipant {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  isVerified: boolean;
}

export interface ConversationReadReceipt {
  lastReadMessageId?: string;
  lastReadAt: string;
}

export interface ConversationItem {
  id: string;
  participantPairKey: string;
  participants: ConversationParticipant[];
  partner: ConversationParticipant | null;
  activeContext: ConversationContextCard | null;
  lastMessageId?: string;
  lastMessageSenderId?: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
  readReceipts: Record<string, ConversationReadReceipt>;
  createdAt: string;
  updatedAt: string;
}

export type ClientMessageDeliveryState = 'SENDING' | 'SENT' | 'FAILED';

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string;
  text: string;
  attachments: string[];
  contextCard: ConversationContextCard | null;
  readBy: string[];
  createdAt: string;
  sender: ConversationParticipant;
  deliveryState?: ClientMessageDeliveryState;
  errorMessage?: string;
}

export interface CursorMessagesResult {
  items: ChatMessageItem[];
  nextCursor: string | null;
  hasMore: boolean;
  readReceipts: Record<string, ConversationReadReceipt>;
}

export type NotificationType =
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'COMMENT_REPLY'
  | 'NEW_FOLLOWER'
  | 'BOOKING_REQUEST'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_HANDED_OVER'
  | 'BOOKING_RETURN_PENDING'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_REMINDER'
  | 'SYSTEM_ALERT';

export interface NotificationActor {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId?: string;
  actor: NotificationActor | null;
  type: NotificationType;
  bookingId?: string;
  gearId?: string;
  title: string;
  body: string;
  targetUrl: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface PaginatedNotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =========================================================================
// PHASE 6: AI TRAVEL ASSISTANT & TRIP REQUIREMENT STATE
// =========================================================================

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
  activity: string | null;
  environment?: 'COASTAL' | 'MOUNTAIN' | 'FOREST' | 'URBAN' | string | null;
  isOvernight?: boolean | null;
  secondaryActivities?: string[];
  savedSpots?: string[];
  departureDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  travelers: number | null;
  experienceLevel: string | null;
  ownedGear: string[];
  budgetVnd: number | null;
  pickupArea: string | null;
  wantsToRent: boolean;
  notes: string | null;
  ambiguousFields?: string[];
}

export interface ChecklistPreviewItem {
  categoryCode: string;
  name: string;
  quantityNeeded: number;
  quantityOwned: number;
  quantityMissing: number;
  priority: 'ESSENTIAL' | 'CONDITIONAL' | 'OPTIONAL';
  isRentable: boolean;
  note: string;
  reason: string;
}

export interface AiConversationItem {
  id: string;
  conversationId: string;
  sessionId: string;
  userId: string;
  title: string;
  status: AiConversationStatus;
  stateVersion: number;
  tripState: ValidatedTripState;
  missingFields: string[];
  nextQuestion: string | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  travelPlanId?: string | null;
  checklistId?: string | null;
  checklistPreview?: ChecklistPreviewItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageItem {
  id: string;
  aiConversationId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  clientMessageId?: string;
  replyToMessageId?: string;
  stateVersion?: number;
  structuredPayload?: Record<string, any> | null;
  createdAt: string;
  deliveryState?: 'SENDING' | 'SENT' | 'FAILED';
  errorMessage?: string;
}

export interface AiTurnResponse {
  conversationId: string;
  deduplicated: boolean;
  status: AiConversationStatus;
  stateVersion: number;
  reply: string;
  userMessage: AiMessageItem;
  assistantMessage: AiMessageItem | null;
  tripState: ValidatedTripState;
  missingFields: string[];
  nextQuestion: string | null;
  checklistPreview: ChecklistPreviewItem[];
  providerMeta?: {
    source: 'GEMINI' | 'VIETNAMESE_NLP_PARSER';
    model: string;
    latencyMs: number;
  };
  conversation: AiConversationItem;
}



