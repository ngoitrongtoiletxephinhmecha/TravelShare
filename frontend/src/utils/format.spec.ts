import { describe, expect, it } from 'vitest';
import { formatVietnamDateTime, formatVnd } from './format';
import { isVideoUrl } from '../components/social/MediaGallery';
import { BOOKING_STATUS_CONFIG } from '../components/booking/BookingComponents';
import {
  normalizeChatMessage,
  normalizeConversation,
} from '../services/chat.service';
import { normalizeNotification } from '../services/notification.service';
import {
  normalizeAiConversation,
  normalizeTripState,
} from '../services/ai.service';

describe('Vietnam Localization, Currency, Social Media, Booking & Phase 5 Realtime Utilities', () => {
  it('formats 0 VND as free loan label', () => {
    expect(formatVnd(0)).toBe('Miễn phí (Cho mượn)');
  });

  it('formats positive amounts in VND currency', () => {
    const formatted = formatVnd(300000);
    expect(formatted).toContain('300.000');
  });

  it('formats date in Asia/Ho_Chi_Minh timezone', () => {
    const formatted = formatVietnamDateTime('2026-11-15T01:30:00.000Z');
    expect(formatted).toContain('15/11/2026');
    expect(formatted).toContain('08:30');
  });

  it('correctly identifies video URLs vs image URLs in MediaGallery', () => {
    expect(isVideoUrl('http://localhost:4000/uploads/trekking-clip.mp4')).toBe(
      true,
    );
    expect(isVideoUrl('https://cdn.travelshare.vn/camp.webm?token=1')).toBe(
      true,
    );
    expect(isVideoUrl('http://localhost:4000/uploads/photo.jpg')).toBe(false);
  });

  it('maps all 9 Phase 4 booking workflow statuses to Vietnamese labels and variants', () => {
    const expectedStatuses = [
      'PENDING',
      'APPROVED',
      'IN_USE',
      'RETURN_PENDING',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'DISPUTED',
    ] as const;
    for (const st of expectedStatuses) {
      expect(BOOKING_STATUS_CONFIG[st]).toBeDefined();
      expect(BOOKING_STATUS_CONFIG[st].label.length).toBeGreaterThan(2);
    }
  });

  it('normalizes Phase 5 conversation, message clientMessageId, and booking notification payloads', () => {
    const conv = normalizeConversation({
      _id: '673700000000000000000001',
      participantPairKey: 'userA:userB',
      partner: {
        userId: 'userB',
        username: 'vy_camping',
        fullName: 'Nguyễn Thảo Vy',
      },
      activeContext: {
        type: 'BOOKING',
        refId: 'booking123',
        title: 'Giao dịch #ING123 • Lều Naturehike',
        subtitle: 'Trạng thái: APPROVED • 2 ngày',
        targetUrl: '/bookings/booking123',
      },
      unreadCount: 2,
    });

    expect(conv.id).toBe('673700000000000000000001');
    expect(conv.partner?.id).toBe('userB');
    expect(conv.activeContext?.referenceId).toBe('booking123');
    expect(conv.activeContext?.targetUrl).toBe('/bookings/booking123');

    const msg = normalizeChatMessage({
      _id: 'msg001',
      conversationId: conv.id,
      senderId: 'userA',
      clientMessageId: 'cmsg-uuid-1',
      content: 'Hẹn 18h nhận lều nhé!',
      readBy: ['userA'],
    });
    expect(msg.id).toBe('msg001');
    expect(msg.clientMessageId).toBe('cmsg-uuid-1');
    expect(msg.text).toBe('Hẹn 18h nhận lều nhé!');
    expect(msg.deliveryState).toBe('SENT');

    const notif = normalizeNotification({
      _id: 'notif001',
      recipientId: 'userB',
      type: 'BOOKING_APPROVED',
      bookingId: 'booking123',
      title: 'Yêu cầu thuê đã được duyệt!',
      body: 'Chủ thiết bị đã chấp nhận yêu cầu thuê của bạn.',
      targetUrl: '/bookings/booking123',
      isRead: false,
    });
    expect(notif.id).toBe('notif001');
    expect(notif.type).toBe('BOOKING_APPROVED');
    expect(notif.targetUrl).toBe('/bookings/booking123');
    expect(notif.isRead).toBe(false);
  });

  it('normalizes Phase 6 AI conversation and tripState payloads accurately', () => {
    const trip = normalizeTripState({
      intent: 'PREPARE_TRIP',
      destination: 'Yên Tử',
      activity: 'TREKKING',
      durationDays: 1,
      travelers: 4,
      ownedGear: ['BACKPACK', 'RAIN_JACKET'],
    });
    expect(trip.destination).toBe('Yên Tử');
    expect(trip.activity).toBe('TREKKING');
    expect(trip.durationDays).toBe(1);
    expect(trip.travelers).toBe(4);
    expect(trip.budgetVnd).toBeNull();

    const aiConv = normalizeAiConversation({
      _id: 'ai-conv-001',
      userId: 'user1',
      title: 'Trekking Yên Tử (1 ngày)',
      status: 'READY_FOR_CHECKLIST',
      stateVersion: 4,
      tripState: trip,
      missingFields: [],
    });
    expect(aiConv.id).toBe('ai-conv-001');
    expect(aiConv.status).toBe('READY_FOR_CHECKLIST');
    expect(aiConv.tripState.destination).toBe('Yên Tử');
    expect(aiConv.tripState.travelers).toBe(4);
  });
});
