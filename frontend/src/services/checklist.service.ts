import { apiClient } from './api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ChecklistItemDto {
  itemId: string;
  categoryCode: string;
  name: string;
  priority: 'ESSENTIAL' | 'RECOMMENDED' | 'CONDITIONAL';
  quantityRequired: number;
  quantityNeeded: number;
  quantityOwned: number;
  quantityMissing: number;
  unit: string;
  canRent: boolean;
  isRentable: boolean;
  requiredAttributes: Record<string, any>;
  ownedConfirmed: boolean;
  userEditedOwned?: boolean;
  userEditedRequired?: boolean;
  isCustomItem?: boolean;
  note: string;
  reason: string;
}

export interface ChecklistDetailDto {
  id: string;
  checklistId: string;
  userId: string;
  travelPlanId: string | null;
  aiConversationId: string | null;
  title: string;
  planVersion: number;
  checklistVersion: number;
  items: ChecklistItemDto[];
  removedItemCodes?: string[];
  summary?: {
    totalCategories: number;
    rentableMissingCategories: number;
    totalMissingRentableUnits: number;
    unconfirmedCount: number;
  };
  travelPlan?: {
    id: string;
    destination: string;
    activity: string;
    durationDays: number;
    travelers: number;
    departureDate: string | null;
    budgetVnd: number | null;
    pickupArea: string | null;
    planVersion: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistMatchCandidateDto {
  gearId: string;
  id: string;
  title: string;
  categoryCode: string;
  brand: string;
  condition: string;
  sharingType: 'RENT' | 'FREE_LOAN' | 'BOTH';
  images: string[];
  city: string;
  district: string;
  pickupAreaLabel: string;
  distanceKm: number | null;
  attributes: Record<string, any>;
  totalQuantity: number;
  availableQuantity: number;
  fulfillableQuantity: number;
  quantityMissing: number;
  coverageLabel: string;
  isFullCoverage: boolean;
  rentalDays: number;
  pricePerDay: number;
  unitRentalFee: number;
  estimatedRentalTotal: number;
  depositPerUnit: number;
  depositAmount: number;
  ratingAvg: number;
  isOwnGear: boolean;
  isDemo: boolean;
  owner: {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    trustScore: number;
  };
  recommendationReason: string;
  bookingUrl: string;
}

export interface ChecklistItemMatchDto {
  itemId: string;
  categoryCode: string;
  name: string;
  priority: 'ESSENTIAL' | 'RECOMMENDED' | 'CONDITIONAL';
  unit: string;
  quantityRequired: number;
  quantityNeeded: number;
  quantityOwned: number;
  quantityMissing: number;
  requiredAttributes: Record<string, any>;
  sizeAllocations?: Array<{
    sizeLabel: string | null;
    qtyNeeded: number;
    qtyFulfilled: number;
    unmatchedReason: string | null;
  }>;
  totalFulfillableQuantity: number;
  isFullyFulfillable: boolean;
  coverageSummaryLabel: string;
  minEstimatedCostForItemVnd: number;
  minDepositForItemVnd: number;
  unmatchedReason: string | null;
  candidates: ChecklistMatchCandidateDto[];
  totalCandidatesCount?: number;
}

export interface ChecklistMatchResultDto {
  checklistId: string;
  checklistVersion: number;
  planVersion: number;
  checkedAt: string;
  interval: {
    startAt: string;
    endAt: string;
    rentalDays: number;
  };
  filters: {
    pickupArea: string | null;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number | null;
    budgetVnd: number | null;
    hasBudgetLimit: boolean;
    sharingType: string | null;
  };
  budgetSummary: {
    hasBudgetLimit: boolean;
    budgetVnd: number | null;
    minTotalEstimatedCostVnd: number;
    minTotalDepositVnd: number;
    canFulfillAllItems: boolean;
    isWithinTotalBudget: boolean;
    hasUnconfirmedItems?: boolean;
    statusLabel: string;
  };
  allocationPlan?: Array<{
    itemId: string;
    categoryCode: string;
    itemName: string;
    sizeLabel: string | null;
    gearId: string;
    title: string;
    quantityAllocated: number;
    unit: string;
    pricePerDay: number;
    rentalDays: number;
    totalRentalFee: number;
    depositAmount: number;
    bookingUrl: string;
  }>;
  itemMatches: ChecklistItemMatchDto[];
  unmatchedItems: Array<{
    itemId: string;
    categoryCode: string;
    name: string;
    quantityRequired: number;
    quantityOwned: number;
    quantityMissing: number;
    unit: string;
    requiredAttributes: Record<string, any>;
    unmatchedReason: string;
  }>;
  nonRentableItems: Array<{
    itemId: string;
    categoryCode: string;
    name: string;
    quantityRequired: number;
    unit: string;
    note: string;
  }>;
  unconfirmedOwnedItems: Array<{
    itemId: string;
    categoryCode: string;
    name: string;
    quantityRequired: number;
    quantityOwned: number;
    message: string;
  }>;
}

export const checklistService = {
  async createOrGetChecklistForPlan(
    travelPlanId: string,
  ): Promise<ChecklistDetailDto> {
    const res = await apiClient.post<ApiResponse<ChecklistDetailDto>>(
      `/travel-plans/${travelPlanId}/checklist`,
      {},
    );
    return res.data.data;
  },

  async getChecklistById(checklistId: string): Promise<ChecklistDetailDto> {
    const res = await apiClient.get<ApiResponse<ChecklistDetailDto>>(
      `/checklists/${checklistId}`,
    );
    return res.data.data;
  },

  async updateChecklistItem(
    checklistId: string,
    itemId: string,
    payload: {
      quantityRequired?: number;
      quantityOwned?: number;
      ownedConfirmed?: boolean;
      requiredAttributes?: Record<string, any>;
      note?: string;
      expectedChecklistVersion?: number;
    },
  ): Promise<ChecklistDetailDto> {
    const res = await apiClient.patch<ApiResponse<ChecklistDetailDto>>(
      `/checklists/${checklistId}/items/${encodeURIComponent(itemId)}`,
      payload,
    );
    return res.data.data;
  },

  async addChecklistItem(
    checklistId: string,
    payload: {
      name: string;
      categoryCode?: string;
      quantityRequired?: number;
      quantityOwned?: number;
      unit?: string;
      canRent?: boolean;
      expectedChecklistVersion?: number;
    },
  ): Promise<ChecklistDetailDto> {
    const res = await apiClient.post<ApiResponse<ChecklistDetailDto>>(
      `/checklists/${checklistId}/items`,
      payload,
    );
    return res.data.data;
  },

  async removeChecklistItem(
    checklistId: string,
    itemId: string,
    expectedChecklistVersion?: number,
  ): Promise<ChecklistDetailDto> {
    const res = await apiClient.delete<ApiResponse<ChecklistDetailDto>>(
      `/checklists/${checklistId}/items/${encodeURIComponent(itemId)}`,
      {
        params: expectedChecklistVersion
          ? { expectedChecklistVersion }
          : undefined,
      },
    );
    return res.data.data;
  },

  async matchMissingGear(
    checklistId: string,
    payload: {
      startAt: string;
      endAt: string;
      pickupArea?: string;
      city?: string;
      district?: string;
      budgetVnd?: number | null;
      sharingType?: 'RENT' | 'FREE_LOAN' | 'BOTH';
      expectedChecklistVersion?: number;
    },
  ): Promise<ChecklistMatchResultDto> {
    const res = await apiClient.post<ApiResponse<ChecklistMatchResultDto>>(
      `/checklists/${checklistId}/matches`,
      payload,
    );
    return res.data.data;
  },
};
