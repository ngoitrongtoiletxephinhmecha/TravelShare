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
    const next: ValidatedTripState = {
      ...this.normalizeExistingTripState(currentState),
      ownedGear: [...(currentState.ownedGear || [])],
      ownedGearQuantities: { ...(currentState.ownedGearQuantities || {}) },
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
        'Bạn dự định đi địa điểm nào và tham gia hoạt động gì (ví dụ: trekking Yên Tử, cắm trại Hồ Đồng Đò hay săn mây Lảo Thẩn)?';
    } else if (missingFields.includes('destination')) {
      nextQuestion =
        'Bạn dự định đi trekking/cắm trại ở địa điểm nào để mình tư vấn trang bị phù hợp địa hình nhé?';
    } else if (missingFields.includes('activity')) {
      nextQuestion = `Tại **${state.destination}**, bạn dự định đi **trekking leo núi**, **cắm trại qua đêm (camping)** hay đi dã ngoại nhẹ nhàng?`;
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
  }): string {
    const {
      prevState,
      nextState,
      patch,
      validation,
      checklistPreview,
      checklistMutationSummaries = [],
      checklistClarifications = [],
    } = params;
    const lines: string[] = [];

    // 1. Summarize what was recognized or updated in this turn
    const changes: string[] = [];

    if (
      patch.updatedFields.destination &&
      patch.updatedFields.destination !== prevState.destination
    ) {
      const actLabel = nextState.activity
        ? ACTIVITY_LABELS_VI[nextState.activity]
        : 'chuyến đi';
      changes.push(
        `địa điểm **${nextState.destination}** (${actLabel})`,
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

    if (checklistMutationSummaries.length > 0) {
      lines.push(
        checklistMutationSummaries.map((s) => `✅ ${s}`).join('\n'),
      );
      if (changes.length > 0) {
        lines.push(`Đồng thời mình đã ghi nhận: ${changes.join(', ')}.`);
      }
    } else if (changes.length > 0) {
      lines.push(`Mình đã ghi nhận cập nhật cho chuyến đi của bạn: ${changes.join(', ')}.`);
    } else if (nextState.destination) {
      lines.push(
        `Mình vẫn đang lưu thông tin chuyến đi **${nextState.destination}** của bạn.`,
      );
    } else {
      lines.push(
        'Chào bạn! Mình là **Trợ lý AI TravelShare**, chuyên tư vấn chuẩn bị đồ trekking, camping và kết nối thiết bị cho thuê từ cộng đồng.',
      );
    }

    // 2. Destination-specific terrain note (never fabricating live weather or operating hours)
    if (
      patch.updatedFields.destination === 'Yên Tử' &&
      prevState.destination !== 'Yên Tử'
    ) {
      lines.push(
        '⛰️ **Lưu ý địa hình Yên Tử:** Cung đường Yên Tử có nhiều bậc đá dốc và độ ẩm cao ở khu vực rừng trúc — chùa Đồng. Bạn nên ưu tiên giày bám đường tốt, gậy trekking trợ lực khớp gối và áo khoác chắn gió. *(Lưu ý: Thời tiết thực tế và lịch vận hành cáp treo có thể thay đổi theo ngày, bạn nhớ kiểm tra dự báo thời tiết mới nhất trước giờ xuất phát nhé).*',
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
    if (validation.status === 'NEEDS_INFORMATION') {
      if (
        validation.nextQuestion &&
        !patch.ambiguousDateNote &&
        checklistClarifications.length === 0
      ) {
        lines.push(validation.nextQuestion);
      }
    } else {
      if (checklistMutationSummaries.length === 0) {
        lines.push(
          `✅ **Thông tin chuyến đi đã đủ để lập Checklist chuẩn bị đồ!** (${nextState.destination || 'Chuyến đi'} • ${
            nextState.activity ? ACTIVITY_LABELS_VI[nextState.activity] : 'Trekking'
          } • ${nextState.durationDays} ngày • ${nextState.travelers} người).`,
        );
      }

      if (checklistPreview && checklistPreview.length > 0) {
        const previewLines = checklistPreview
          .slice(0, 7)
          .map((item) => {
            const reqQty = item.quantityRequired ?? item.quantityNeeded;
            return `- **${item.name}**: Cần **${reqQty}** (Đã có: **${item.quantityOwned}**, Còn thiếu: **${item.quantityMissing}** — *${
              item.priority === ChecklistPriority.ESSENTIAL
                ? 'Thiết yếu'
                : 'Khuyên dùng'
            }*)`;
          });
        lines.push(
          `📋 **Bản xem trước Checklist hiện tại (${nextState.travelers} người):**\n${previewLines.join('\n')}`,
        );
      }

      if (checklistClarifications.length === 0) {
        if (validation.nextQuestion) {
          lines.push(`💡 *Gợi ý thêm:* ${validation.nextQuestion}`);
        } else {
          lines.push(
            'Bạn có thể điều chỉnh lại số người, số ngày, bổ sung đồ đã có hoặc nhập ngân sách/khu vực nhận đồ bất cứ lúc nào!',
          );
        }
      }
    }

    return lines.join('\n\n');
  }
}
