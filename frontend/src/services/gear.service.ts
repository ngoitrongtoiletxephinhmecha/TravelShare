import { apiClient } from './api';
import {
  GearAvailabilityPeriod,
  GearAvailabilityResponse,
  GearCategoryItem,
  GearCondition,
  GearDetailData,
  GearItemData,
  GearSharingType,
  GearStatus,
  PaginatedGearResult,
} from '../types';

export interface SearchGearParams {
  q?: string;
  categoryCode?: string;
  sharingType?: GearSharingType;
  condition?: GearCondition;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  lng?: number;
  lat?: number;
  radiusKm?: number;
  startAt?: string;
  endAt?: string;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'distance';
  page?: number;
  limit?: number;
}

export interface UpsertGearPayload {
  categoryCode: string;
  title: string;
  description: string;
  brand?: string;
  condition: GearCondition;
  attributes?: Record<string, string | number | boolean>;
  images?: string[];
  totalQuantity?: number;
  sharingType: GearSharingType;
  pricePerDay: number;
  depositAmount: number;
  city: string;
  district: string;
  longitude?: number;
  latitude?: number;
  usageRules?: string[];
  availabilitySettings?: {
    minRentalDays: number;
    maxRentalDays: number;
    advanceNoticeHours: number;
  };
  status?: GearStatus;
}

export const gearService = {
  async getCategories(): Promise<GearCategoryItem[]> {
    const { data } = await apiClient.get('/gear/categories');
    return data.data;
  },

  async searchGear(params: SearchGearParams): Promise<PaginatedGearResult> {
    const { data } = await apiClient.get('/gear', { params });
    return data.data;
  },

  async getGearById(id: string): Promise<GearDetailData> {
    const { data } = await apiClient.get(`/gear/${id}`);
    return data.data;
  },

  async getMyGearItems(status?: GearStatus): Promise<GearItemData[]> {
    const { data } = await apiClient.get('/gear/my-items', {
      params: status ? { status } : undefined,
    });
    return data.data;
  },

  async getPublicGearByOwner(ownerIdentifier: string): Promise<GearItemData[]> {
    const { data } = await apiClient.get(`/gear/owner/${ownerIdentifier}`);
    return data.data;
  },

  async createGear(payload: UpsertGearPayload): Promise<GearItemData> {
    const { data } = await apiClient.post('/gear', payload);
    return data.data;
  },

  async updateGear(
    id: string,
    payload: Partial<UpsertGearPayload>,
  ): Promise<GearItemData> {
    const { data } = await apiClient.patch(`/gear/${id}`, payload);
    return data.data;
  },

  async updateGearStatus(
    id: string,
    status: GearStatus,
  ): Promise<GearItemData> {
    const { data } = await apiClient.patch(`/gear/${id}/status`, { status });
    return data.data;
  },

  async checkAvailability(
    gearId: string,
    params?: { startAt?: string; endAt?: string; quantity?: number },
  ): Promise<GearAvailabilityResponse> {
    const { data } = await apiClient.get(`/gear/${gearId}/availability`, {
      params,
    });
    return data.data;
  },

  async addUnavailablePeriod(
    gearId: string,
    payload: {
      startAt: string;
      endAt: string;
      reservedQuantity?: number;
      note?: string;
    },
  ): Promise<GearAvailabilityPeriod> {
    const { data } = await apiClient.post(
      `/gear/${gearId}/unavailable-periods`,
      payload,
    );
    return data.data;
  },

  async removeUnavailablePeriod(
    gearId: string,
    periodId: string,
  ): Promise<{ deleted: boolean; periodId: string }> {
    const { data } = await apiClient.delete(
      `/gear/${gearId}/unavailable-periods/${periodId}`,
    );
    return data.data;
  },
};
