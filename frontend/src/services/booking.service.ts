import { apiClient } from './api';
import {
  BookingDetailData,
  BookingReviewItem,
  BookingStatus,
  DisputeItem,
  DisputeReason,
  DisputeStatus,
  GearCondition,
  HandoverRecord,
  PaginatedBookingsResult,
  UserReviewsResponse,
} from '../types';

export interface CreateBookingPayload {
  gearId: string;
  startAt: string;
  endAt: string;
  quantity?: number;
  renterNote?: string;
}

export interface SubmitHandoverPayload {
  photos?: string[];
  condition?: GearCondition;
  notes?: string;
}

export const bookingService = {
  async createBooking(
    payload: CreateBookingPayload,
  ): Promise<BookingDetailData> {
    const { data } = await apiClient.post('/bookings', payload);
    return data.data;
  },

  async getSentBookings(params?: {
    status?: BookingStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedBookingsResult> {
    const { data } = await apiClient.get('/bookings/sent', { params });
    return data.data;
  },

  async getReceivedBookings(params?: {
    status?: BookingStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedBookingsResult> {
    const { data } = await apiClient.get('/bookings/received', { params });
    return data.data;
  },

  async getBookingById(id: string): Promise<BookingDetailData> {
    const { data } = await apiClient.get(`/bookings/${id}`);
    return data.data;
  },

  async approveBooking(id: string, note?: string): Promise<BookingDetailData> {
    const { data } = await apiClient.post(`/bookings/${id}/approve`, { note });
    return data.data;
  },

  async rejectBooking(id: string, reason?: string): Promise<BookingDetailData> {
    const { data } = await apiClient.post(`/bookings/${id}/reject`, { reason });
    return data.data;
  },

  async cancelBooking(id: string, reason: string): Promise<BookingDetailData> {
    const { data } = await apiClient.post(`/bookings/${id}/cancel`, { reason });
    return data.data;
  },

  async confirmPickupHandover(
    id: string,
    payload: SubmitHandoverPayload,
  ): Promise<BookingDetailData> {
    const { data } = await apiClient.post(`/bookings/${id}/handover`, payload);
    return data.data;
  },

  async confirmReturnHandover(
    id: string,
    payload: SubmitHandoverPayload,
  ): Promise<BookingDetailData> {
    const { data } = await apiClient.post(`/bookings/${id}/return`, payload);
    return data.data;
  },

  async getBookingHandovers(id: string): Promise<HandoverRecord[]> {
    const { data } = await apiClient.get(`/bookings/${id}/handovers`);
    return data.data;
  },

  async createReview(
    bookingId: string,
    payload: { rating: number; comment: string },
  ): Promise<BookingReviewItem> {
    const { data } = await apiClient.post(
      `/bookings/${bookingId}/reviews`,
      payload,
    );
    return data.data;
  },

  async getUserReviews(userIdOrUsername: string): Promise<UserReviewsResponse> {
    const { data } = await apiClient.get(
      `/users/${encodeURIComponent(userIdOrUsername)}/reviews`,
    );
    return data.data;
  },

  async getGearReviews(gearId: string): Promise<BookingReviewItem[]> {
    const { data } = await apiClient.get(`/bookings/gear/${gearId}/reviews`);
    return data.data;
  },

  async createDispute(
    bookingId: string,
    payload: {
      reason: DisputeReason;
      description: string;
      evidence?: string[];
    },
  ): Promise<DisputeItem> {
    const { data } = await apiClient.post(
      `/bookings/${bookingId}/disputes`,
      payload,
    );
    return data.data;
  },

  async getAdminDisputes(): Promise<DisputeItem[]> {
    const { data } = await apiClient.get('/admin/disputes');
    return data.data;
  },

  async resolveDispute(
    disputeId: string,
    payload: { status: DisputeStatus; adminNotes: string },
  ): Promise<DisputeItem> {
    const { data } = await apiClient.patch(
      `/admin/disputes/${disputeId}`,
      payload,
    );
    return data.data;
  },
};
