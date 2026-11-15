import { Injectable } from '@nestjs/common';
import {
  ActivityType,
  ChecklistPriority,
  ExperienceLevel,
} from '../../common/enums/system.enums';
import {
  AiConversationStatus,
  ChecklistEntry,
  ValidatedTripState,
} from '../../database/schemas/ai-checklist.schema';
import { ExtractedTripPatch } from './trip-requirement.parser';

export interface TripValidationResult {
  status: AiConversationStatus;
  missingFields: string[];
  recommendedOptionalFields: string[];
  nextQuestion: string | null;
}

const ACTIVITY_LABELS_VI: Record<ActivityType, string> = {
  [ActivityType.TREKKING]: 'Trekking / Leo núi',
  [ActivityType.CAMPING]: 'Cắm trại (Camping)',
  [ActivityType.MOTORBIKE_TOUR]: 'Phượt xe máy',
  [ActivityType.BACKPACKING]: 'Du lịch bụi (Backpacking)',
  [ActivityType.MOUNTAINEERING]: 'Chinh phục đỉnh cao (Mountaineering)',
  [ActivityType.BEACH_CAMPING]: 'Cắm trại biển',
  [ActivityType.OTHER]: 'Dã ngoại ngoài trời',
};

const GEAR_CODE_LABELS_VI: Record<string, string> = {
  TENT: 'Lều trại',
  BACKPACK: 'Balo trekking',
  SLEEPING_BAG: 'Túi ngủ',
  TREKKING_SHOES: 'Giày trekking',
  TREKKING_POLES: 'Gậy trekking',
  RAIN_JACKET: 'Áo khoác chống nước / Áo mưa',
  HEADLAMP: 'Đèn đội đầu / Đèn pin',
  CAMPING_STOVE: 'Bếp dã ngoại',
  CAMPING_CHAIR: 'Bàn ghế camping',
  CAMERA: 'Máy ảnh hành trình',
};

@Injectable()
export class TripStateValidator {
  createEmptyTripState(): ValidatedTripState {
    return {
      intent: null,
      destination: null,
      route: null,
      activity: null,
      departureDate: null,
      endDate: null,
      durationDays: null,
      travelers: null,
      experienceLevel: null,
      ownedGear: [],
      ownedGearQuantities: {},
      requiredGearQuantities: {},
      removedGearCodes: [],
      customGearItems: [],
      budgetVnd: null,
      pickupArea: null,
      wantsToRent: false,
      notes: null,
      ambiguousFields: [],
    };
  }

  normalizeExistingTripState(raw?: Partial<ValidatedTripState> | null): ValidatedTripState {
    const base = this.createEmptyTripState();
    if (!raw || typeof raw !== 'object') {
      return base;
    }
    return {
      intent: raw.intent ?? null,
      destination: raw.destination ?? null,
      route: raw.route ?? null,
      activity: raw.activity ?? null,
      departureDate: raw.departureDate ?? null,
      endDate: raw.endDate ?? null,
      durationDays:
        typeof raw.durationDays === 'number' && raw.durationDays > 0
          ? raw.durationDays
          : null,
      travelers:
        typeof raw.travelers === 'number' && raw.travelers > 0
          ? raw.travelers
          : null,
      experienceLevel: raw.experienceLevel ?? null,
      ownedGear: Array.isArray(raw.ownedGear) ? [...raw.ownedGear] : [],
      ownedGearQuantities:
        raw.ownedGearQuantities && typeof raw.ownedGearQuantities === 'object'
          ? { ...raw.ownedGearQuantities }
          : {},
      requiredGearQuantities:
        raw.requiredGearQuantities &&
        typeof raw.requiredGearQuantities === 'object'
          ? { ...raw.requiredGearQuantities }
          : {},
      removedGearCodes: Array.isArray(raw.removedGearCodes)
        ? [...raw.removedGearCodes]
        : [],
      customGearItems: Array.isArray(raw.customGearItems)
        ? raw.customGearItems.map((i) => ({ ...i }))
        : [],
      budgetVnd:
        typeof raw.budgetVnd === 'number' && raw.budgetVnd >= 0
          ? raw.budgetVnd
          : null,
      pickupArea: raw.pickupArea ?? null,
      wantsToRent: Boolean(raw.wantsToRent),
      notes: raw.notes ?? null,
      ambiguousFields: Array.isArray(raw.ambiguousFields)
        ? [...raw.ambiguousFields]
        : [],
    };
  }

  /**
   * Merge existing tripState with newly extracted patch:
   * - Cleared fields are reset to null / []
   * - Updated fields overwrite previous values
   * - Unmentioned fields retain their previous values
   */
  mergeTripState(
    currentState: ValidatedTripState,
    patch: ExtractedTripPatch,
  ): ValidatedTripState {
    const normalizedCurrent = this.normalizeExistingTripState(currentState);
    const next: ValidatedTripState = {
      ...normalizedCurrent,
      ownedGear: [...(normalizedCurrent.ownedGear || [])],
      ownedGearQuantities: { ...(normalizedCurrent.ownedGearQuantities || {}) },
      requiredGearQuantities: {
        ...(normalizedCurrent.requiredGearQuantities || {}),
      },
      removedGearCodes: [...(normalizedCurrent.removedGearCodes || [])],
      customGearItems: (normalizedCurrent.customGearItems || []).map((i) => ({
        ...i,
      })),
      ambiguousFields: [],
    };

    // 1. Apply explicit field removals
    for (const field of patch.clearedFields || []) {
      if (field === 'ownedGear') {
        next.ownedGear = [];
        next.ownedGearQuantities = {};
      } else if (field === 'wantsToRent') {
        next.wantsToRent = false;
      } else if (field in next) {
        (next as any)[field] = null;
      }
    }

    // 2. Apply updated fields
    const u = patch.updatedFields || {};
    if (u.intent !== undefined) next.intent = u.intent;
    if (u.destination !== undefined) next.destination = u.destination;
    if (u.route !== undefined) next.route = u.route;
    if (u.activity !== undefined) next.activity = u.activity;
    if (u.departureDate !== undefined) next.departureDate = u.departureDate;
    if (u.durationDays !== undefined) next.durationDays = u.durationDays;
    if (u.travelers !== undefined) next.travelers = u.travelers;
    if (u.experienceLevel !== undefined) {
      next.experienceLevel = u.experienceLevel;
    }
    if (u.budgetVnd !== undefined) next.budgetVnd = u.budgetVnd;
    if (u.pickupArea !== undefined) next.pickupArea = u.pickupArea;
    if (u.wantsToRent !== undefined) next.wantsToRent = u.wantsToRent;
    if (u.notes !== undefined) next.notes = u.notes;

    if (u.ownedGear && u.ownedGear.length > 0) {
      if (patch.ownedGearMode === 'REPLACE' && next.ownedGear.length === 0) {
        next.ownedGear = Array.from(new Set(u.ownedGear));
      } else {
        next.ownedGear = Array.from(
          new Set([...next.ownedGear, ...u.ownedGear]),
        );
      }
    }

    if (u.ownedGearQuantities && typeof u.ownedGearQuantities === 'object') {
      next.ownedGearQuantities = {
        ...(next.ownedGearQuantities || {}),
        ...u.ownedGearQuantities,
      };
    }

    // Remove from ownedGear if user explicitly removed item from checklist
    if (patch.checklistOperations?.length) {
      for (const op of patch.checklistOperations) {
        if (op.intent === 'REMOVE_ITEM') {
          next.ownedGear = next.ownedGear.filter(
            (c) => c.toUpperCase() !== op.categoryCode.toUpperCase(),
          );
          if (next.ownedGearQuantities) {
            delete next.ownedGearQuantities[op.categoryCode.toUpperCase()];
          }
        }
      }
    }

    // Default intent to PREPARE_TRIP once destination or activity is set
    if (!next.intent && (next.destination || next.activity)) {
      next.intent = 'PREPARE_TRIP';
    }

    // Recompute endDate if departureDate and durationDays are known
    if (next.departureDate && next.durationDays && next.durationDays >= 1) {
      const start = new Date(`${next.departureDate}T00:00:00.000Z`);
      if (!isNaN(start.getTime())) {
        const end = new Date(
          start.getTime() + next.durationDays * 24 * 60 * 60 * 1000,
        );
        next.endDate = end.toISOString().slice(0, 10);
      }
    } else if (!next.departureDate) {
      next.endDate = null;
    }

    if (patch.ambiguousDateNote) {
      next.ambiguousFields = ['departureDate'];
    }

    return next;
  }

  /**
   * Evaluate missing fields and select a single high-utility follow-up question
   */
  validateTripState(
    state: ValidatedTripState,
    ambiguousDateNote?: string | null,
  ): TripValidationResult {
    const missingFields: string[] = [];
    const recommendedOptionalFields: string[] = [];

    if (!state.activity) {
      missingFields.push('activity');
    }
    if (!state.durationDays || state.durationDays < 1) {
      missingFields.push('durationDays');
    }
    if (!state.travelers || state.travelers < 1) {
      missingFields.push('travelers');
    }

    // Destination is required while gathering trip info, or recommended if activity + durationDays + travelers are already known
    if (!state.destination) {
      if (missingFields.length > 0) {
        missingFields.unshift('destination');
      } else {
        recommendedOptionalFields.push('destination');
      }
    }

    // Rental-specific fields are only asked when user explicitly wants to find rental gear
    // OR recommended gently once core checklist fields are ready
    if (state.wantsToRent) {
      if (!state.departureDate) {
        recommendedOptionalFields.push('departureDate');
      }
      if (!state.pickupArea) {
        recommendedOptionalFields.push('pickupArea');
      }
    }

    if (!state.experienceLevel) {
      recommendedOptionalFields.push('experienceLevel');
    }

    // Prioritize ONE helpful question per turn
    let nextQuestion: string | null = null;

    if (ambiguousDateNote) {
      nextQuestion = ambiguousDateNote;
    } else if (missingFields.includes('destination') && missingFields.includes('activity')) {
      nextQuestion =
        'Bạn dự định đi địa điểm nào và tham gia hoạt động gì (ví dụ: cắm trại Ba Vì, trekking Yên Tử hay tham quan)?';
    } else if (missingFields.includes('destination')) {
      nextQuestion =
        'Bạn dự định đi địa điểm nào để mình tư vấn phù hợp nhé?';
    } else if (missingFields.includes('activity')) {
      nextQuestion = `Tại **${state.destination}**, bạn dự định đi **tham quan**, **trekking leo núi** hay **cắm trại**?`;
    } else if (
      missingFields.includes('durationDays') &&
      missingFields.includes('travelers')
    ) {
      nextQuestion = `Chuyến đi **${state.destination}** của bạn dự kiến kéo dài **mấy ngày** và đoàn gồm **bao nhiêu người** ạ?`;
    } else if (missingFields.includes('durationDays')) {
      nextQuestion = `Nhóm ${state.travelers} người của bạn dự kiến đi **${state.destination}** trong **mấy ngày** (ví dụ: đi về trong 1 ngày hay 2 ngày 1 đêm)?`;
    } else if (missingFields.includes('travelers')) {
      nextQuestion = `Chuyến đi **${state.destination}** (${state.durationDays} ngày) của bạn có **bao nhiêu thành viên** tham gia để mình tính đúng số lượng thiết bị cần chuẩn bị?`;
    } else if (
      state.wantsToRent &&
      (!state.departureDate || !state.pickupArea)
    ) {
      if (!state.departureDate && !state.pickupArea) {
        nextQuestion =
          'Để lọc thiết bị đang trống lịch và gần bạn nhất trên TravelShare, bạn dự định khởi hành ngày nào và muốn nhận đồ ở khu vực nào (ví dụ: Đống Đa, Cầu Giấy - Hà Nội)?';
      } else if (!state.departureDate) {
        nextQuestion =
          'Bạn dự kiến khởi hành vào ngày nào (DD/MM/YYYY) để hệ thống kiểm tra lịch khả dụng của thiết bị cho thuê?';
      } else {
        nextQuestion =
          'Bạn muốn nhận thiết bị thuê ở khu vực/quận nào để tiện di chuyển nhất?';
      }
    }

    const status: AiConversationStatus =
      missingFields.length === 0 ? 'READY_FOR_CHECKLIST' : 'NEEDS_INFORMATION';

    return {
      status,
      missingFields,
      recommendedOptionalFields,
      nextQuestion,
    };
  }

  /**
   * Build a natural, accurate Vietnamese assistant reply reflecting the latest state changes
   * and using the just-saved checklist for both the confirmation and preview.
   */
  buildVietnameseAssistantReply(params: {
    prevState: ValidatedTripState;
    nextState: ValidatedTripState;
    patch: ExtractedTripPatch;
    validation: TripValidationResult;
    checklistPreview?: ChecklistEntry[];
    checklistMutationSummaries?: string[];
    checklistClarifications?: string[];
    checklistReadReplies?: string[];
    checklistJustCreated?: boolean;
    shouldPrintFullChecklist?: boolean;
    userMessage?: string;
    checklistExists?: boolean;
  }): string {
    const {
      prevState,
      nextState,
      patch,
      validation,
      checklistPreview,
      checklistMutationSummaries = [],
      checklistClarifications = [],
      checklistReadReplies = [],
      checklistJustCreated = false,
      shouldPrintFullChecklist = false,
      userMessage = '',
      checklistExists = false,
    } = params;
    const lines: string[] = [];

    if (patch.providerFailureNote && !patch.generalAnswer && !patch.destinationAnswer && !patch.itineraryAnswer) {
      return patch.providerFailureNote;
    }

    if (patch.isUnrecognizedFallback) {
      const preservedHint = nextState.destination
        ? `Thông tin chuyến đi (**${nextState.destination}**) và checklist hiện tại vẫn được giữ nguyên.`
        : 'Hiện chưa có thông tin kế hoạch nào bị thay đổi.';
      return `Mình chưa rõ ý bạn muốn hỏi thông tin, cập nhật kế hoạch hay chỉnh sửa checklist. ${preservedHint} Bạn có thể nói cụ thể hơn (ví dụ: *"Giới thiệu Ba Vì"*, *"Đi Ba Vì cắm trại 2 ngày 3 người"*, hoặc *"Nhóm đã có 2 balo"*).`;
    }

    // 1. Summarize what was recognized or updated in this turn
    const changes: string[] = [];

    if (
      patch.updatedFields.destination &&
      patch.updatedFields.destination !== prevState.destination
    ) {
      changes.push(
        nextState.activity
          ? `địa điểm **${nextState.destination}** (${ACTIVITY_LABELS_VI[nextState.activity]})`
          : `địa điểm **${nextState.destination}**`,
      );
    } else if (
      patch.updatedFields.activity &&
      patch.updatedFields.activity !== prevState.activity
    ) {
      changes.push(
        `hoạt động **${ACTIVITY_LABELS_VI[nextState.activity!]}**`,
      );
    }

    if (
      patch.updatedFields.durationDays !== undefined &&
      patch.updatedFields.durationDays !== prevState.durationDays
    ) {
      if (prevState.durationDays) {
        changes.push(
          `thời lượng từ **${prevState.durationDays} ngày** thành **${nextState.durationDays} ngày**`,
        );
      } else {
        changes.push(`thời lượng **${nextState.durationDays} ngày**`);
      }
    }

    if (
      patch.updatedFields.travelers !== undefined &&
      patch.updatedFields.travelers !== prevState.travelers
    ) {
      if (prevState.travelers) {
        changes.push(
          `số lượng thành viên từ **${prevState.travelers} người** thành **${nextState.travelers} người**`,
        );
      } else {
        changes.push(`quy mô nhóm **${nextState.travelers} người**`);
      }
    }

    if (
      patch.updatedFields.departureDate &&
      patch.updatedFields.departureDate !== prevState.departureDate
    ) {
      changes.push(`ngày khởi hành **${nextState.departureDate}**`);
    }

    if (
      patch.updatedFields.route &&
      patch.updatedFields.route !== prevState.route
    ) {
      changes.push(`tuyến đường **${nextState.route}**`);
    }

    if (
      patch.updatedFields.budgetVnd !== undefined &&
      patch.updatedFields.budgetVnd !== prevState.budgetVnd
    ) {
      changes.push(
        `ngân sách thuê dự kiến **${nextState.budgetVnd?.toLocaleString('vi-VN')} ₫**`,
      );
    }

    if (
      patch.updatedFields.pickupArea &&
      patch.updatedFields.pickupArea !== prevState.pickupArea
    ) {
      changes.push(`khu vực nhận đồ **${nextState.pickupArea}**`);
    }

    if (
      patch.updatedFields.ownedGear?.length &&
      checklistMutationSummaries.length === 0
    ) {
      const gearNames = patch.updatedFields.ownedGear.map(
        (code) => GEAR_CODE_LABELS_VI[code] || code,
      );
      changes.push(`thiết bị đã có sẵn (**${gearNames.join(', ')}**)`);
    }

    if (patch.clearedFields.length > 0) {
      changes.push(
        `đã xóa thông tin theo yêu cầu (${patch.clearedFields.join(', ')})`,
      );
    }

    const hasDestinationQa = Boolean(patch.destinationAnswer);
    const hasGeneralQa = Boolean(patch.generalAnswer);
    const hasItineraryAdvice = Boolean(patch.itineraryAnswer);
    const hasReadReplies = checklistReadReplies.length > 0;
    const isSmallTalkOnly = Boolean(
      patch.turnActions?.includes('SMALL_TALK') &&
        changes.length === 0 &&
        checklistMutationSummaries.length === 0 &&
        !hasDestinationQa &&
        !hasGeneralQa &&
        !hasItineraryAdvice &&
        !hasReadReplies,
    );
    const isPureChecklistView = Boolean(
      patch.requestChecklistPrint &&
        changes.length === 0 &&
        checklistMutationSummaries.length === 0 &&
        !hasDestinationQa &&
        !hasGeneralQa &&
        !hasItineraryAdvice &&
        !hasReadReplies,
    );

    if (isSmallTalkOnly) {
      if (/(cảm\s*ơn|thank|ok(?:ie)?|tạm\s*biệt|bye)/i.test(userMessage)) {
        return 'Không có gì đâu bạn! Nếu bạn cần hỏi thêm về điểm đến, kinh nghiệm chuẩn bị đồ hay chỉnh checklist chuyến đi, cứ nhắn mình bất cứ lúc nào nhé.';
      }
      return 'Chào bạn! Mình là **Trợ lý AI TravelShare**. Mình có thể trò chuyện giải đáp về địa điểm, tư vấn đồ dùng dã ngoại hoặc giúp bạn lập kế hoạch và checklist cho chuyến đi. Bạn đang quan tâm đến chủ đề nào?';
    }

    if (hasDestinationQa && patch.destinationAnswer) {
      lines.push(patch.destinationAnswer);
    }

    if (hasGeneralQa && patch.generalAnswer) {
      lines.push(patch.generalAnswer);
    }

    if (hasItineraryAdvice && patch.itineraryAnswer) {
      lines.push(patch.itineraryAnswer);
    }

    if (hasReadReplies) {
      lines.push(checklistReadReplies.map((r) => `📦 ${r}`).join('\n'));
    }

    if (checklistMutationSummaries.length > 0) {
      lines.push(
        checklistMutationSummaries.map((s) => `✅ ${s}`).join('\n'),
      );
      if (changes.length > 0) {
        lines.push(`Đồng thời mình đã ghi nhận: ${changes.join(', ')}.`);
      }
    } else if (changes.length > 0) {
      lines.push(`Mình đã ghi nhận vào kế hoạch chuyến đi: ${changes.join(', ')}.`);
    } else if (
      !hasDestinationQa &&
      !hasGeneralQa &&
      !hasItineraryAdvice &&
      !hasReadReplies &&
      !isPureChecklistView &&
      !checklistJustCreated &&
      checklistClarifications.length === 0
    ) {
      if (nextState.destination) {
        lines.push(
          `Mình vẫn đang lưu thông tin chuyến đi **${nextState.destination}** của bạn.`,
        );
      } else {
        lines.push(
          'Chào bạn! Mình là **Trợ lý AI TravelShare**, sẵn sàng giải đáp thắc mắc hoặc hỗ trợ bạn lên kế hoạch và checklist cho chuyến đi.',
        );
      }
    }

    if (patch.preliminaryGearSuggestion) {
      lines.push(`🎒 **Gợi ý đồ chuẩn bị sơ bộ:** ${patch.preliminaryGearSuggestion}`);
    }

    if (hasItineraryAdvice) {
      const savedParts: string[] = [];
      if (nextState.destination) savedParts.push(nextState.destination);
      if (nextState.activity) {
        savedParts.push(ACTIVITY_LABELS_VI[nextState.activity]);
      }
      if (nextState.durationDays) {
        savedParts.push(`${nextState.durationDays} ngày`);
      }
      if (nextState.travelers) {
        savedParts.push(`${nextState.travelers} người`);
      }
      lines.push(
        savedParts.length > 0
          ? `📌 *Lưu ý dữ liệu:* Thông tin kế hoạch đã lưu gồm **${savedParts.join(' • ')}**. Lịch trình chi tiết từng buổi/ngày ở trên chỉ là gợi ý tham khảo trong hội thoại (không tự tạo hoặc sửa checklist nếu bạn chưa yêu cầu).`
          : '📌 *Lưu ý dữ liệu:* Lịch trình trên là gợi ý tham khảo trong hội thoại; hệ thống chưa lưu hay tạo checklist cho đến khi bạn chốt thông tin chuyến đi.',
      );
    }

    // 2. Destination-specific terrain note when starting a Yên Tử trip without repeating if QA already ran
    if (
      !hasDestinationQa &&
      !patch.preliminaryGearSuggestion &&
      patch.updatedFields.destination === 'Yên Tử' &&
      prevState.destination !== 'Yên Tử'
    ) {
      lines.push(
        '⛰️ **Lưu ý địa hình Yên Tử:** Cung đường Yên Tử có nhiều bậc đá dốc và độ ẩm cao. Bạn nên ưu tiên giày bám đường tốt, gậy leo núi và áo khoác chắn gió; đồng thời kiểm tra lại dự báo thời tiết trước giờ xuất phát.',
      );
    }

    if (patch.ambiguousDateNote) {
      lines.push(`⚠️ ${patch.ambiguousDateNote}`);
    }

    // Clarification questions for checklist operations (e.g. "Nhóm đã có bao nhiêu balo?" or "Bạn muốn giảm số cần chuẩn bị hay giảm số đã có?")
    if (checklistClarifications.length > 0) {
      lines.push(
        checklistClarifications.map((q) => `❓ ${q}`).join('\n'),
      );
    }

    // 3. Follow-up question or READY_FOR_CHECKLIST summary
    const isReadOrQaOnly =
      (hasDestinationQa ||
        hasGeneralQa ||
        hasItineraryAdvice ||
        hasReadReplies) &&
      changes.length === 0 &&
      checklistMutationSummaries.length === 0 &&
      !checklistJustCreated &&
      !patch.requestChecklistPrint;

    const asksPureAdviceOnly =
      (hasGeneralQa || (hasItineraryAdvice && !validation.missingFields.length)) &&
      checklistMutationSummaries.length === 0 &&
      !checklistJustCreated;

    if (validation.status === 'NEEDS_INFORMATION') {
      if (
        !isReadOrQaOnly &&
        !asksPureAdviceOnly &&
        !hasItineraryAdvice &&
        validation.nextQuestion &&
        !patch.ambiguousDateNote &&
        checklistClarifications.length === 0
      ) {
        lines.push(validation.nextQuestion);
      }
    } else if (!isReadOrQaOnly) {
      if (
        checklistMutationSummaries.length === 0 &&
        (checklistJustCreated || changes.length > 0)
      ) {
        lines.push(
          `✅ **Kế hoạch chuyến đi đã đủ thông tin (READY_FOR_CHECKLIST)!** (${nextState.destination || 'Chuyến đi'} • ${
            nextState.activity
              ? ACTIVITY_LABELS_VI[nextState.activity]
              : 'Chưa chọn hoạt động'
          } • ${nextState.durationDays} ngày • ${nextState.travelers} người).${
            !checklistJustCreated && !checklistExists
              ? ' Bạn có thể bấm nút **Tạo checklist** trên màn hình hoặc nhắn *"Tạo checklist"* bất cứ lúc nào.'
              : ''
          }`,
        );
      }

      if (
        shouldPrintFullChecklist &&
        checklistPreview &&
        checklistPreview.length > 0
      ) {
        const itemsToPrint = patch.requestChecklistPrint
          ? checklistPreview
          : checklistPreview.slice(0, 7);
        const previewLines = itemsToPrint.map((item) => {
          const reqQty = item.quantityRequired ?? item.quantityNeeded;
          return `- **${item.name}**: Cần **${reqQty}** (Đã có: **${item.quantityOwned}**, Còn thiếu: **${item.quantityMissing}** — *${
            item.priority === ChecklistPriority.ESSENTIAL
              ? 'Thiết yếu'
              : 'Khuyên dùng'
          }*)`;
        });
        lines.push(
          `📋 **Checklist hiện tại (${nextState.travelers} người):**\n${previewLines.join('\n')}`,
        );
      } else if (
        patch.requestChecklistPrint &&
        (!checklistPreview || checklistPreview.length === 0)
      ) {
        lines.push(
          '📋 Hiện tại chưa có checklist được lưu. Hãy cho mình biết địa điểm, hoạt động, số ngày và số người (hoặc bấm **Tạo checklist**) để lập danh sách nhé.',
        );
      }

      if (checklistClarifications.length === 0 && !isPureChecklistView) {
        if (validation.nextQuestion && (checklistJustCreated || changes.length > 0)) {
          lines.push(`💡 *Gợi ý thêm:* ${validation.nextQuestion}`);
        } else if (checklistJustCreated) {
          lines.push(
            'Bạn có thể điều chỉnh lại số lượng đồ cần/đã có bằng chat hoặc trực tiếp trên bảng checklist bất cứ lúc nào!',
          );
        }
      }
    }

    return lines.join('\n\n');
  }
}
