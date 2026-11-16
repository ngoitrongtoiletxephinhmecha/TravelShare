export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}

export enum ActivityType {
  TREKKING = 'TREKKING',
  CAMPING = 'CAMPING',
  MOTORBIKE_TOUR = 'MOTORBIKE_TOUR',
  BACKPACKING = 'BACKPACKING',
  MOUNTAINEERING = 'MOUNTAINEERING',
  BEACH = 'BEACH',
  SIGHTSEEING = 'SIGHTSEEING',
  OTHER = 'OTHER',
}

export type TripEnvironment = 'COASTAL' | 'MOUNTAIN' | 'FOREST' | 'URBAN';

const OFFICIAL_ACTIVITY_SET = new Set<string>(Object.values(ActivityType));

/**
 * Normalizes official or legacy (e.g. BEACH_CAMPING) activity values while
 * preserving coastal context for legacy BEACH_CAMPING records.
 */
export function normalizeLegacyActivity(
  rawActivity: string | null | undefined,
  rawEnvironment?: string | null,
): {
  activity: ActivityType | null;
  environment: TripEnvironment | null;
  wasLegacyBeachCamping: boolean;
} {
  const normalizedEnv: TripEnvironment | null =
    rawEnvironment && ['COASTAL', 'MOUNTAIN', 'FOREST', 'URBAN'].includes(String(rawEnvironment).toUpperCase())
      ? (String(rawEnvironment).toUpperCase() as TripEnvironment)
      : null;

  if (!rawActivity) {
    return { activity: null, environment: normalizedEnv, wasLegacyBeachCamping: false };
  }

  const upper = String(rawActivity).trim().toUpperCase();
  if (upper === 'BEACH_CAMPING') {
    return {
      activity: ActivityType.CAMPING,
      environment: normalizedEnv || 'COASTAL',
      wasLegacyBeachCamping: true,
    };
  }

  if (OFFICIAL_ACTIVITY_SET.has(upper)) {
    return {
      activity: upper as ActivityType,
      environment: upper === ActivityType.BEACH && !normalizedEnv ? 'COASTAL' : normalizedEnv,
      wasLegacyBeachCamping: false,
    };
  }

  return { activity: null, environment: normalizedEnv, wasLegacyBeachCamping: false };
}

export enum ExperienceLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum GearCondition {
  NEW = 'NEW',
  LIKE_NEW = 'LIKE_NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
}

export enum GearListingType {
  RENT = 'RENT',
  FREE_LOAN = 'FREE_LOAN',
  BOTH = 'BOTH',
}

export enum GearStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  UNAVAILABLE = 'UNAVAILABLE',
  ARCHIVED = 'ARCHIVED',
}

export enum GearModerationStatus {
  APPROVED = 'APPROVED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  IN_USE = 'IN_USE',
  RETURN_PENDING = 'RETURN_PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  DISPUTED = 'DISPUTED',
}

export enum HandoverType {
  PICKUP = 'PICKUP',
  RETURN = 'RETURN',
}

export enum DisputeReason {
  DAMAGED_GEAR = 'DAMAGED_GEAR',
  LATE_RETURN = 'LATE_RETURN',
  NO_SHOW_DELIVERY = 'NO_SHOW_DELIVERY',
  MISREPRESENTED_GEAR = 'MISREPRESENTED_GEAR',
  OTHER = 'OTHER',
}

export enum ChecklistPriority {
  ESSENTIAL = 'ESSENTIAL',
  CONDITIONAL = 'CONDITIONAL',
  OPTIONAL = 'OPTIONAL',
}

export enum CommunityRole {
  OWNER = 'OWNER',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export enum ReactionType {
  LIKE = 'LIKE',
  LOVE = 'LOVE',
  INSPIRE = 'INSPIRE',
}

export enum NotificationType {
  NEW_FOLLOWER = 'NEW_FOLLOWER',
  POST_COMMENT = 'POST_COMMENT',
  COMMENT_REPLY = 'COMMENT_REPLY',
  NEW_MESSAGE = 'NEW_MESSAGE',
  BOOKING_REQUEST = 'BOOKING_REQUEST',
  BOOKING_APPROVED = 'BOOKING_APPROVED',
  BOOKING_REJECTED = 'BOOKING_REJECTED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_HANDED_OVER = 'BOOKING_HANDED_OVER',
  BOOKING_RETURN_PENDING = 'BOOKING_RETURN_PENDING',
  BOOKING_COMPLETED = 'BOOKING_COMPLETED',
  BOOKING_RETURN_REMINDER = 'BOOKING_RETURN_REMINDER',
  NEW_REVIEW = 'NEW_REVIEW',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  REPORT_DISMISSED = 'REPORT_DISMISSED',
  CONTENT_MODERATED = 'CONTENT_MODERATED',
  DISPUTE_UPDATED = 'DISPUTE_UPDATED',
}

export enum ReportTargetType {
  POST = 'POST',
  COMMENT = 'COMMENT',
  GEAR = 'GEAR',
  USER = 'USER',
  BOOKING = 'BOOKING',
}

export enum ReportStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_MEDIATION = 'UNDER_MEDIATION',
  RESOLVED_FOR_OWNER = 'RESOLVED_FOR_OWNER',
  RESOLVED_FOR_RENTER = 'RESOLVED_FOR_RENTER',
  CLOSED = 'CLOSED',
}
