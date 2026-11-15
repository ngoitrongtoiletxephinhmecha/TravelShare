import { describe, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { AI_CHAT_REQUEST_TIMEOUT_MS, aiService } from './ai.service';
import { checklistService } from './checklist.service';

describe('Phase 9A AI & Checklist API Client Configuration', () => {
  it('uses a dedicated longer timeout on AI chat routes than the global apiClient timeout', async () => {
    const defaultTimeout = Number(apiClient.defaults.timeout || 0);
    expect(defaultTimeout).toBe(12000);
    expect(AI_CHAT_REQUEST_TIMEOUT_MS).toBeGreaterThan(defaultTimeout);
    expect(AI_CHAT_REQUEST_TIMEOUT_MS).toBe(75000);

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        data: {
          conversationId: 'conv-1',
          status: 'NEEDS_INFORMATION',
          stateVersion: 2,
          reply: 'OK',
          userMessage: { id: 'u1', role: 'user', content: 'Hi' },
          assistantMessage: { id: 'a1', role: 'assistant', content: 'OK' },
          tripState: {},
          missingFields: [],
          checklistPreview: [],
          conversation: { id: 'conv-1' },
        },
      },
    } as any);

    await aiService.sendMessage('conv-1', {
      content: 'Giới thiệu ngắn gọn về Ba Vì',
      clientMessageId: 'cmsg-9a-1',
    });

    expect(postSpy).toHaveBeenCalledWith(
      '/ai/conversations/conv-1/messages',
      {
        content: 'Giới thiệu ngắn gọn về Ba Vì',
        clientMessageId: 'cmsg-9a-1',
      },
      { timeout: AI_CHAT_REQUEST_TIMEOUT_MS },
    );

    postSpy.mockRestore();
  });

  it('forwards expectedChecklistVersion for optimistic concurrency on checklist mutations', async () => {
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({
      data: { data: { id: 'cl-1', checklistVersion: 4, items: [] } },
    } as any);

    const res = await checklistService.updateChecklistItem('cl-1', 'item_TENT', {
      quantityOwned: 1,
      ownedConfirmed: true,
      expectedChecklistVersion: 3,
    });

    expect(res.checklistVersion).toBe(4);
    expect(patchSpy).toHaveBeenCalledWith('/checklists/cl-1/items/item_TENT', {
      quantityOwned: 1,
      ownedConfirmed: true,
      expectedChecklistVersion: 3,
    });
    patchSpy.mockRestore();

    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { data: { id: 'cl-1', checklistVersion: 5, items: [] } },
    } as any);

    await checklistService.removeChecklistItem('cl-1', 'item_TENT', 4);
    expect(deleteSpy).toHaveBeenCalledWith('/checklists/cl-1/items/item_TENT', {
      params: { expectedChecklistVersion: 4 },
    });
    deleteSpy.mockRestore();
  });
});
