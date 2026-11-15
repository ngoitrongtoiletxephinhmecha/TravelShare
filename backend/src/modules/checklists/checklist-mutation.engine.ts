import {
  ActivityType,
  ChecklistPriority,
} from '../../common/enums/system.enums';
import { ChecklistEntry } from '../../database/schemas/ai-checklist.schema';

export type ChecklistOperationIntent =
  | 'SET_OWNED'
  | 'INCREMENT_OWNED'
  | 'DECREMENT_OWNED'
  | 'SET_MISSING'
  | 'SET_REQUIRED'
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'AMBIGUOUS_DECREMENT'
  | 'ASK_OWNED_QUANTITY';

export interface ParsedChecklistOperation {
  intent: ChecklistOperationIntent;
  categoryCode: string;
  itemName: string;
  quantity: number | null;
  unit?: string;
  requiredAttributes?: Record<string, any>;
  rawClause?: string;
  rawSegment?: string;
}

export interface ChecklistRuleTemplate {
  activity: ActivityType;
  categoryCode: string;
  itemName: string;
  unit: string;
  priority: ChecklistPriority;
  scalingRule:
    | 'PER_PERSON'
    | 'SHARED_2_3'
    | 'ONE_PER_GROUP'
    | 'PER_PERSON_DAY_2L'
    | 'PER_PERSON_DAY';
  canRent: boolean;
  overnightOnly?: boolean;
  defaultAttributes?: Record<string, any>;
  reasonTemplate: string;
}

export interface GearCatalogMetadata {
  categoryCode: string;
  shortLabelVi: string;
  defaultItemName: string;
  unit: string;
  canRent: boolean;
  priority: ChecklistPriority;
  scalingRule: 'PER_PERSON' | 'SHARED_2_3' | 'ONE_PER_GROUP';
  reasonTemplate: string;
}

export const GEAR_CATALOG_METADATA: Record<string, GearCatalogMetadata> = {
  TENT: {
    categoryCode: 'TENT',
    shortLabelVi: 'lều',
    defaultItemName: 'Lều cắm trại chống mưa 2 lớp',
    unit: 'bộ',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    reasonTemplate: 'Không gian nghỉ ngơi qua đêm, chắn gió và mưa sương.',
  },
  CAMPING_CHAIR: {
    categoryCode: 'CAMPING_CHAIR',
    shortLabelVi: 'ghế xếp',
    defaultItemName: 'Ghế xếp camping thư giãn',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Tăng trải nghiệm nghỉ ngơi thoải mái bên hồ/bãi cỏ.',
  },
  BACKPACK: {
    categoryCode: 'BACKPACK',
    shortLabelVi: 'balo',
    defaultItemName: 'Balo trekking trợ lực (25L - 50L)',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Phân bổ trọng lượng đều lên hông và vai suốt hành trình.',
  },
  SLEEPING_BAG: {
    categoryCode: 'SLEEPING_BAG',
    shortLabelVi: 'túi ngủ',
    defaultItemName: 'Túi ngủ giữ nhiệt vùng cao',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Đảm bảo thân nhiệt ban đêm khi ngủ lán hoặc lều.',
  },
  TREKKING_SHOES: {
    categoryCode: 'TREKKING_SHOES',
    shortLabelVi: 'giày trekking',
    defaultItemName: 'Giày trekking cổ lửng chống trượt',
    unit: 'đôi',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bảo vệ cổ chân và bám địa hình đá ẩm rêu phong.',
  },
  TREKKING_POLES: {
    categoryCode: 'TREKKING_POLES',
    shortLabelVi: 'gậy trekking',
    defaultItemName: 'Gậy trekking chống sốc',
    unit: 'cặp',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Giảm 25-30% áp lực lên khớp gối khi lên/xuống bậc đá dốc.',
  },
  RAIN_JACKET: {
    categoryCode: 'RAIN_JACKET',
    shortLabelVi: 'áo khoác / áo mưa',
    defaultItemName: 'Áo khoác gió chống nước / Áo mưa bộ',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Giữ ấm và chống sương mù, mưa rừng bất chợt.',
  },
  HEADLAMP: {
    categoryCode: 'HEADLAMP',
    shortLabelVi: 'đèn đội đầu',
    defaultItemName: 'Đèn đội đầu siêu sáng chống nước',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Chiếu sáng khi xuất phát sớm hoặc sinh hoạt tối tại trại.',
  },
  CAMPING_STOVE: {
    categoryCode: 'CAMPING_STOVE',
    shortLabelVi: 'bếp dã ngoại',
    defaultItemName: 'Bếp gas dã ngoại & bộ nồi xếp gọn',
    unit: 'bộ',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    reasonTemplate: 'Nấu ăn và pha đồ uống nóng cho cả nhóm tại bãi trại.',
  },
  TARP: {
    categoryCode: 'TARP',
    shortLabelVi: 'tấm bạt',
    defaultItemName: 'Tấm bạt / Tăng che mưa dã ngoại',
    unit: 'tấm',
    canRent: true,
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    reasonTemplate: 'Che mưa nắng và lót khu vực sinh hoạt chung ngoài trời.',
  },
  CAMERA: {
    categoryCode: 'CAMERA',
    shortLabelVi: 'máy ảnh',
    defaultItemName: 'Máy ảnh hành trình / Action Cam',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    reasonTemplate: 'Ghi lại khoảnh khắc hành trình của nhóm.',
  },
  WATER_ELECTROLYTE: {
    categoryCode: 'WATER_ELECTROLYTE',
    shortLabelVi: 'nước uống & điện giải',
    defaultItemName: 'Nước uống & Điện giải bù khoáng',
    unit: 'lít',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bù nước và khoáng chất liên tục (nhu yếu phẩm tự chuẩn bị).',
  },
  TRAIL_FOOD: {
    categoryCode: 'TRAIL_FOOD',
    shortLabelVi: 'đồ ăn năng lượng',
    defaultItemName: 'Đồ ăn năng lượng / Lương khô / Thanh hạt',
    unit: 'suất',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bổ sung năng lượng nhanh trên đường đi (tự chuẩn bị).',
  },
};

export const BUILTIN_CHECKLIST_RULES: ChecklistRuleTemplate[] = [
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'BACKPACK',
    itemName: 'Balo trekking trợ lực (25L - 50L)',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Phân bổ trọng lượng đều lên hông và vai suốt hành trình leo núi.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TREKKING_POLES',
    itemName: 'Gậy trekking chống sốc',
    unit: 'cặp',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Giảm 25-30% áp lực lên khớp gối khi lên/xuống bậc đá dốc.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TREKKING_SHOES',
    itemName: 'Giày trekking cổ lửng chống trượt',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    defaultAttributes: {},
    reasonTemplate: 'Bảo vệ cổ chân và bám địa hình đá ẩm rêu phong (cần chọn đúng size giày).',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn đội đầu siêu sáng chống nước',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Cần thiết khi xuất phát sáng sớm hoặc xuống núi lúc chiều muộn.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TENT',
    itemName: 'Lều cắm trại chống mưa 2 lớp',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    canRent: true,
    overnightOnly: true,
    reasonTemplate: 'Dành cho hành trình trekking có nghỉ đêm ngoài trời.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'SLEEPING_BAG',
    itemName: 'Túi ngủ giữ nhiệt vùng cao',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    overnightOnly: true,
    reasonTemplate: 'Đảm bảo thân nhiệt ban đêm khi ngủ lán hoặc lều.',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác gió chống nước / Áo mưa bộ cá nhân',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Giữ ấm và chống sương mù, mưa rừng bất chợt (trang phục cá nhân tự chuẩn bị).',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống & Điện giải bù khoáng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Bù nước và khoáng chất liên tục khi vận động cường độ cao (tự chuẩn bị, không cho thuê).',
  },
  {
    activity: ActivityType.TREKKING,
    categoryCode: 'TRAIL_FOOD',
    itemName: 'Đồ ăn năng lượng / Lương khô / Thanh hạt',
    unit: 'suất',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY',
    canRent: false,
    reasonTemplate: 'Bổ sung năng lượng nhanh trên đường rừng (nhu yếu phẩm tiêu hao, không cho thuê).',
  },
  // CAMPING RULES
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TENT',
    itemName: 'Lều cắm trại chống mưa PU3000mm+',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    canRent: true,
    reasonTemplate: 'Không gian nghỉ ngơi chính cho nhóm cắm trại.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'SLEEPING_BAG',
    itemName: 'Túi ngủ & Đệm cách nhiệt dã ngoại',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Giữ ấm cơ thể khi nhiệt độ ban đêm bên hồ/đồi hạ thấp.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'CAMPING_STOVE',
    itemName: 'Bếp gas dã ngoại & bộ nồi xếp gọn',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    reasonTemplate: 'Nấu ăn và pha đồ uống nóng cho cả nhóm tại bãi trại.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'CAMPING_CHAIR',
    itemName: 'Ghế xếp camping thư giãn',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Tăng trải nghiệm nghỉ ngơi thoải mái bên hồ/bãi cỏ.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn lồng treo lều / Đèn đội đầu cắm trại',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Chiếu sáng khu vực sinh hoạt chung vào buổi tối.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống sinh hoạt & nấu nướng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Nước sạch dùng để nấu ăn và uống tại bãi trại (nhu yếu phẩm tự chuẩn bị).',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TRAIL_FOOD',
    itemName: 'Thực phẩm BBQ / Đồ ăn dã ngoại',
    unit: 'suất',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY',
    canRent: false,
    reasonTemplate: 'Thực phẩm tươi và đồ ăn nhẹ theo khẩu vị nhóm (tự chuẩn bị, không cho thuê).',
  },
];

export function computeChecklistEntryNote(entry: {
  canRent: boolean;
  ownedConfirmed: boolean;
  quantityMissing: number;
}): string {
  if (!entry.canRent) {
    return 'Tự chuẩn bị cá nhân (Không thuộc nhóm thuê)';
  }
  if (!entry.ownedConfirmed) {
    return 'Bạn đã báo có sẵn trong hội thoại — hãy xác nhận số lượng thực tế';
  }
  if (entry.quantityMissing > 0) {
    return 'Có thể tìm thuê/mượn trên TravelShare';
  }
  return 'Đã đủ số lượng cần thiết';
}

export function normalizeChecklistEntry(raw: Partial<ChecklistEntry>): ChecklistEntry {
  const code = String(raw.categoryCode || 'OTHER').toUpperCase();
  const meta = GEAR_CATALOG_METADATA[code];
  const quantityRequired = Math.max(
    1,
    Math.floor(Number(raw.quantityRequired ?? raw.quantityNeeded ?? 1)),
  );
  const quantityOwned = Math.max(
    0,
    Math.floor(Number(raw.quantityOwned ?? 0)),
  );
  const quantityMissing = Math.max(0, quantityRequired - quantityOwned);
  const canRent =
    code === 'WATER_ELECTROLYTE' ||
    code === 'TRAIL_FOOD' ||
    code === 'RAIN_JACKET'
      ? false
      : code === 'TREKKING_SHOES'
        ? true
        : Boolean(raw.canRent ?? raw.isRentable ?? meta?.canRent ?? true);
  const ownedConfirmed = raw.ownedConfirmed !== false;

  return {
    itemId: raw.itemId || `item_${code}`,
    categoryCode: code,
    name: raw.name || meta?.defaultItemName || code,
    quantityRequired,
    quantityNeeded: quantityRequired,
    quantityOwned,
    quantityMissing,
    unit: raw.unit || meta?.unit || 'chiếc',
    priority: raw.priority || meta?.priority || ChecklistPriority.ESSENTIAL,
    canRent,
    isRentable: canRent,
    requiredAttributes: raw.requiredAttributes ? { ...raw.requiredAttributes } : {},
    ownedConfirmed,
    userEditedOwned: Boolean(raw.userEditedOwned),
    userEditedRequired: Boolean(raw.userEditedRequired),
    isCustomItem: Boolean(raw.isCustomItem),
    note:
      raw.note ||
      computeChecklistEntryNote({
        canRent,
        ownedConfirmed,
        quantityMissing,
      }),
    reason: raw.reason || meta?.reasonTemplate || '',
  };
}

/**
 * Build or regenerate checklist items from rules while preserving:
 * - User manual edits to `quantityOwned` (`userEditedOwned`)
 * - User manual edits to `quantityRequired` (`userEditedRequired`, unless plan travelers/duration scaled and item was not locked)
 * - Custom added items (`isCustomItem: true`)
 * - Explicitly removed items (`removedItemCodes`)
 * - Explicit quantities captured in `ownedGearQuantities` (NEVER setting `quantityOwned = quantityRequired` when quantity was not specified!)
 */
export function buildChecklistEntriesFromRules(params: {
  activity: ActivityType;
  durationDays: number;
  travelers: number;
  ownedGearCodes?: string[];
  ownedGearQuantities?: Record<string, number>;
  dbRules?: any[];
  previousItems?: ChecklistEntry[];
  removedItemCodes?: string[];
  didTravelersOrDurationChange?: boolean;
}): ChecklistEntry[] {
  const rawActivity = params.activity || ActivityType.TREKKING;
  const effectiveActivity =
    rawActivity === ActivityType.CAMPING ||
    rawActivity === ActivityType.BEACH_CAMPING
      ? ActivityType.CAMPING
      : ActivityType.TREKKING;

  const travelers = Math.max(1, Math.floor(Number(params.travelers) || 1));
  const durationDays = Math.max(1, Math.floor(Number(params.durationDays) || 1));
  const ownedSet = new Set(
    (params.ownedGearCodes || []).map((c) => String(c).toUpperCase()),
  );
  const explicitQuantities = params.ownedGearQuantities || {};
  const removedSet = new Set(
    (params.removedItemCodes || []).map((c) => String(c).toUpperCase()),
  );

  const dbRuleMap = new Map<string, any>();
  for (const r of params.dbRules || []) {
    dbRuleMap.set(String(r.categoryCode).toUpperCase(), r);
  }

  const baseTemplates = BUILTIN_CHECKLIST_RULES.filter(
    (t) => t.activity === effectiveActivity,
  );

  const prevMap = new Map<string, ChecklistEntry>();
  for (const prev of params.previousItems || []) {
    const norm = normalizeChecklistEntry(prev);
    prevMap.set(norm.itemId, norm);
    prevMap.set(norm.categoryCode, norm);
  }

  const entries: ChecklistEntry[] = [];
  const includedCodes = new Set<string>();

  for (const tpl of baseTemplates) {
    const code = tpl.categoryCode.toUpperCase();
    const itemId = `item_${code}`;

    // Skip if user explicitly removed this item from the checklist
    if (removedSet.has(code) || removedSet.has(itemId)) {
      continue;
    }

    const prevItem = prevMap.get(itemId) || prevMap.get(code);

    // Skip overnight-only gear on 1-day trips unless user manually added/edited it
    if (
      tpl.overnightOnly &&
      durationDays < 2 &&
      !prevItem?.userEditedOwned &&
      !prevItem?.userEditedRequired &&
      !prevItem?.isCustomItem
    ) {
      continue;
    }

    const dbOverride = dbRuleMap.get(code);
    const scalingRule = dbOverride?.scalingRule || tpl.scalingRule;

    let ruleQuantityRequired = travelers;
    if (scalingRule === 'SHARED_2_3') {
      ruleQuantityRequired = Math.max(1, Math.ceil(travelers / 2));
    } else if (scalingRule === 'ONE_PER_GROUP') {
      ruleQuantityRequired = 1;
    } else if (scalingRule === 'PER_PERSON_DAY_2L') {
      ruleQuantityRequired = travelers * durationDays * 2;
    } else if (scalingRule === 'PER_PERSON_DAY') {
      ruleQuantityRequired = travelers * durationDays;
    }

    // Preserve userEditedRequired if trip scale did not change, or if user explicitly customized required quantity
    const quantityRequired =
      prevItem?.userEditedRequired && !params.didTravelersOrDurationChange
        ? prevItem.quantityRequired
        : ruleQuantityRequired;

    const canRent =
      code === 'WATER_ELECTROLYTE' ||
      code === 'TRAIL_FOOD' ||
      code === 'RAIN_JACKET'
        ? false
        : code === 'TREKKING_SHOES'
          ? true
          : Boolean(dbOverride?.isRentable ?? tpl.canRent);

    const mentionedOwnedInChat = ownedSet.has(code);
    const explicitQty = explicitQuantities[code];

    let quantityOwned = 0;
    let ownedConfirmed = true;
    let userEditedOwned = false;

    if (prevItem && prevItem.userEditedOwned) {
      quantityOwned = Math.max(
        0,
        Math.floor(Number(prevItem.quantityOwned) || 0),
      );
      ownedConfirmed = Boolean(prevItem.ownedConfirmed ?? true);
      userEditedOwned = true;
    } else if (
      typeof explicitQty === 'number' &&
      Number.isInteger(explicitQty) &&
      explicitQty >= 0
    ) {
      quantityOwned = explicitQty;
      ownedConfirmed = true;
      userEditedOwned = true;
    } else if (mentionedOwnedInChat) {
      // IMPORTANT FIX: When user only said "đã có balo" without specifying quantity,
      // DO NOT set quantityOwned = quantityRequired! Keep quantityOwned = 0 and mark unconfirmed.
      quantityOwned = prevItem ? prevItem.quantityOwned : 0;
      ownedConfirmed = false;
      userEditedOwned = false;
    } else if (prevItem && typeof prevItem.quantityOwned === 'number') {
      quantityOwned = Math.max(0, Math.floor(prevItem.quantityOwned));
      ownedConfirmed = Boolean(prevItem.ownedConfirmed ?? true);
      userEditedOwned = Boolean(prevItem.userEditedOwned);
    }

    const quantityMissing = Math.max(0, quantityRequired - quantityOwned);
    const requiredAttributes = prevItem?.requiredAttributes
      ? { ...prevItem.requiredAttributes }
      : { ...(tpl.defaultAttributes || {}) };

    entries.push(
      normalizeChecklistEntry({
        itemId,
        categoryCode: code,
        name: dbOverride?.itemName || tpl.itemName,
        quantityRequired,
        quantityNeeded: quantityRequired,
        quantityOwned,
        quantityMissing,
        unit: tpl.unit,
        priority: dbOverride?.priority || tpl.priority,
        canRent,
        isRentable: canRent,
        requiredAttributes,
        ownedConfirmed,
        userEditedOwned,
        userEditedRequired:
          prevItem?.userEditedRequired && !params.didTravelersOrDurationChange,
        isCustomItem: false,
        reason: dbOverride?.reasonTemplate || tpl.reasonTemplate,
      }),
    );

    includedCodes.add(code);
  }

  // Preserve custom items or manually edited items from previousItems that weren't in baseTemplates
  // (as long as they weren't explicitly removed)
  for (const prev of params.previousItems || []) {
    const norm = normalizeChecklistEntry(prev);
    if (
      !includedCodes.has(norm.categoryCode) &&
      !removedSet.has(norm.categoryCode) &&
      !removedSet.has(norm.itemId) &&
      (norm.isCustomItem || norm.userEditedOwned || norm.userEditedRequired)
    ) {
      entries.push(norm);
      includedCodes.add(norm.categoryCode);
    }
  }

  return entries;
}

export interface ChecklistMutationResult {
  items: ChecklistEntry[];
  removedItemCodes: string[];
  appliedSummaries: string[];
  clarificationQuestions: string[];
  didMutate: boolean;
}

/**
 * Apply structured checklist operations (from either chat parser or UI actions)
 * onto an existing checklist's `items` and `removedItemCodes`.
 */
export function applyStructuredChecklistOperations(params: {
  items?: ChecklistEntry[];
  currentItems?: ChecklistEntry[];
  removedItemCodes?: string[];
  operations: ParsedChecklistOperation[];
  isChecklistReady: boolean;
}): ChecklistMutationResult {
  const sourceItems = params.items ?? params.currentItems ?? [];
  const items = sourceItems.map((entry) =>
    normalizeChecklistEntry(entry),
  );
  const removedSet = new Set(
    (params.removedItemCodes || []).map((c) => String(c).toUpperCase()),
  );
  const appliedSummaries: string[] = [];
  const clarificationQuestions: string[] = [];
  let didMutate = false;

  const findItemIndex = (op: ParsedChecklistOperation): number => {
    const code = String(op.categoryCode || '').toUpperCase();
    const targetItemId = `item_${code}`;
    const idxByCode = items.findIndex(
      (i) =>
        i.categoryCode.toUpperCase() === code ||
        i.itemId === targetItemId ||
        i.itemId === op.categoryCode,
    );
    if (idxByCode !== -1) return idxByCode;

    if (op.itemName) {
      const lowerName = op.itemName.trim().toLowerCase();
      return items.findIndex((i) =>
        i.name.toLowerCase().includes(lowerName),
      );
    }
    return -1;
  };

  for (const op of params.operations || []) {
    const code = String(op.categoryCode || 'OTHER').toUpperCase();
    const meta = GEAR_CATALOG_METADATA[code];
    const displayLabel = op.itemName || meta?.shortLabelVi || code;

    if (op.intent === 'ASK_OWNED_QUANTITY') {
      const idx = findItemIndex(op);
      if (idx !== -1 && !items[idx].userEditedOwned) {
        items[idx] = normalizeChecklistEntry({
          ...items[idx],
          ownedConfirmed: false,
        });
        didMutate = true;
      }
      clarificationQuestions.push(`Nhóm đã có bao nhiêu ${displayLabel}?`);
      continue;
    }

    if (op.intent === 'AMBIGUOUS_DECREMENT') {
      const qtyText = op.quantity ?? 1;
      clarificationQuestions.push(
        `Bạn muốn giảm ${qtyText} ${displayLabel} ở **số lượng cần chuẩn bị** hay giảm ở **số lượng nhóm đã có**?`,
      );
      continue;
    }

    if (op.intent === 'REMOVE_ITEM') {
      const idx = findItemIndex(op);
      removedSet.add(code);
      removedSet.add(`item_${code}`);
      if (idx !== -1) {
        const removed = items[idx];
        items.splice(idx, 1);
        didMutate = true;
        appliedSummaries.push(
          `Đã bỏ **${removed.name}** khỏi checklist và danh sách tìm đồ thuê.`,
        );
      } else {
        didMutate = true;
        appliedSummaries.push(
          `Đã ghi nhận bỏ **${meta?.defaultItemName || displayLabel}** khỏi checklist.`,
        );
      }
      continue;
    }

    if (op.intent === 'ADD_ITEM') {
      const qtyToAdd = Math.max(1, Math.floor(Number(op.quantity) || 1));
      removedSet.delete(code);
      removedSet.delete(`item_${code}`);

      const idx = findItemIndex(op);
      if (idx !== -1) {
        const current = items[idx];
        const nextReq = current.isCustomItem
          ? current.quantityRequired + qtyToAdd
          : qtyToAdd;
        const updated = normalizeChecklistEntry({
          ...current,
          quantityRequired: nextReq,
          quantityNeeded: nextReq,
          userEditedRequired: true,
        });
        items[idx] = updated;
        didMutate = true;
        appliedSummaries.push(
          `Đã cập nhật **${updated.name}**: cần chuẩn bị **${updated.quantityRequired}** ${updated.unit}, đã có **${updated.quantityOwned}**, còn thiếu **${updated.quantityMissing}**.`,
        );
      } else {
        const newEntry = normalizeChecklistEntry({
          itemId: `item_${code}`,
          categoryCode: code,
          name: meta?.defaultItemName || op.itemName || code,
          quantityRequired: qtyToAdd,
          quantityNeeded: qtyToAdd,
          quantityOwned: 0,
          quantityMissing: qtyToAdd,
          unit: op.unit || meta?.unit || 'chiếc',
          priority: meta?.priority || ChecklistPriority.CONDITIONAL,
          canRent: meta?.canRent ?? true,
          isRentable: meta?.canRent ?? true,
          ownedConfirmed: true,
          userEditedOwned: false,
          userEditedRequired: true,
          isCustomItem: true,
          reason:
            meta?.reasonTemplate ||
            'Hạng mục được bổ sung trực tiếp theo yêu cầu của nhóm.',
        });
        items.push(newEntry);
        didMutate = true;
        appliedSummaries.push(
          `Đã thêm **${newEntry.name}** vào checklist: cần chuẩn bị **${newEntry.quantityRequired}** ${newEntry.unit}, đã có **0**, còn thiếu **${newEntry.quantityMissing}**.`,
        );
      }
      continue;
    }

    if (op.intent === 'SET_REQUIRED') {
      const reqQty = Math.floor(Number(op.quantity) || 0);
      if (reqQty < 1) {
        clarificationQuestions.push(
          `Số lượng cần chuẩn bị cho ${displayLabel} phải từ 1 trở lên (hoặc bạn có thể yêu cầu "bỏ ${displayLabel} khỏi checklist").`,
        );
        continue;
      }

      removedSet.delete(code);
      removedSet.delete(`item_${code}`);
      const idx = findItemIndex(op);
      if (idx !== -1) {
        const current = items[idx];
        const updated = normalizeChecklistEntry({
          ...current,
          quantityRequired: reqQty,
          quantityNeeded: reqQty,
          userEditedRequired: true,
        });
        items[idx] = updated;
        didMutate = true;
        appliedSummaries.push(
          `Đã cập nhật **${updated.name}**: cần chuẩn bị **${updated.quantityRequired}** ${updated.unit}, đã có **${updated.quantityOwned}**, còn thiếu **${updated.quantityMissing}**.`,
        );
      } else {
        const newEntry = normalizeChecklistEntry({
          itemId: `item_${code}`,
          categoryCode: code,
          name: meta?.defaultItemName || op.itemName || code,
          quantityRequired: reqQty,
          quantityNeeded: reqQty,
          quantityOwned: 0,
          quantityMissing: reqQty,
          unit: op.unit || meta?.unit || 'chiếc',
          priority: meta?.priority || ChecklistPriority.ESSENTIAL,
          canRent: meta?.canRent ?? true,
          isRentable: meta?.canRent ?? true,
          ownedConfirmed: true,
          userEditedOwned: false,
          userEditedRequired: true,
          isCustomItem: true,
        });
        items.push(newEntry);
        didMutate = true;
        appliedSummaries.push(
          `Đã cập nhật **${newEntry.name}**: cần chuẩn bị **${newEntry.quantityRequired}** ${newEntry.unit}, đã có **${newEntry.quantityOwned}**, còn thiếu **${newEntry.quantityMissing}**.`,
        );
      }
      continue;
    }

    if (op.intent === 'SET_MISSING') {
      const missingQty = Math.floor(Number(op.quantity) ?? -1);
      const idx = findItemIndex(op);

      if (idx === -1 || !params.isChecklistReady) {
        clarificationQuestions.push(
          `Hiện chưa xác định tổng số lượng **${displayLabel}** cần chuẩn bị cho nhóm. Nhóm bạn cần tổng cộng bao nhiêu ${displayLabel} và hiện đã có sẵn mấy cái?`,
        );
        continue;
      }

      const current = items[idx];
      if (missingQty < 0 || missingQty > current.quantityRequired) {
        clarificationQuestions.push(
          `Hiện tại **${current.name}** đang có mức cần chuẩn bị là **${current.quantityRequired}** ${current.unit}. Bạn muốn đổi tổng số lượng cần chuẩn bị thành **${missingQty}** ${current.unit} hay cập nhật lại số lượng đã có?`,
        );
        continue;
      }

      const nextOwned = Math.max(0, current.quantityRequired - missingQty);
      const updated = normalizeChecklistEntry({
        ...current,
        quantityOwned: nextOwned,
        ownedConfirmed: true,
        userEditedOwned: true,
      });
      items[idx] = updated;
      didMutate = true;
      appliedSummaries.push(
        `Đã cập nhật **${updated.name}**: cần chuẩn bị **${updated.quantityRequired}** ${updated.unit}, đã có **${updated.quantityOwned}**, còn thiếu **${updated.quantityMissing}**.`,
      );
      continue;
    }

    if (
      op.intent === 'SET_OWNED' ||
      op.intent === 'INCREMENT_OWNED' ||
      op.intent === 'DECREMENT_OWNED'
    ) {
      const rawQty = Math.floor(Number(op.quantity) ?? -1);
      if (rawQty < 0) {
        clarificationQuestions.push(
          `Số lượng ${displayLabel} không hợp lệ. Bạn vui lòng cho biết số nguyên không âm nhé.`,
        );
        continue;
      }

      const idx = findItemIndex(op);
      if (idx !== -1) {
        const current = items[idx];
        let nextOwned = current.quantityOwned;
        if (op.intent === 'SET_OWNED') {
          nextOwned = rawQty;
        } else if (op.intent === 'INCREMENT_OWNED') {
          nextOwned = current.quantityOwned + rawQty;
        } else if (op.intent === 'DECREMENT_OWNED') {
          nextOwned = Math.max(0, current.quantityOwned - rawQty);
        }

        const updated = normalizeChecklistEntry({
          ...current,
          quantityOwned: nextOwned,
          ownedConfirmed: true,
          userEditedOwned: true,
          ...(op.requiredAttributes
            ? {
                requiredAttributes: {
                  ...current.requiredAttributes,
                  ...op.requiredAttributes,
                },
              }
            : {}),
        });
        items[idx] = updated;
        didMutate = true;
        appliedSummaries.push(
          `Đã cập nhật **${updated.name}**: cần chuẩn bị **${updated.quantityRequired}** ${updated.unit}, đã có **${updated.quantityOwned}**, còn thiếu **${updated.quantityMissing}**.`,
        );
      } else {
        // Item is not yet in `items` (e.g., user mentions owning an item not in default rules)
        removedSet.delete(code);
        removedSet.delete(`item_${code}`);
        const defaultReq = Math.max(1, rawQty);
        const newEntry = normalizeChecklistEntry({
          itemId: `item_${code}`,
          categoryCode: code,
          name: meta?.defaultItemName || op.itemName || code,
          quantityRequired: defaultReq,
          quantityNeeded: defaultReq,
          quantityOwned: op.intent === 'DECREMENT_OWNED' ? 0 : rawQty,
          quantityMissing: Math.max(
            0,
            defaultReq - (op.intent === 'DECREMENT_OWNED' ? 0 : rawQty),
          ),
          unit: op.unit || meta?.unit || 'chiếc',
          priority: meta?.priority || ChecklistPriority.CONDITIONAL,
          canRent: meta?.canRent ?? true,
          isRentable: meta?.canRent ?? true,
          ownedConfirmed: true,
          userEditedOwned: true,
          isCustomItem: true,
        });
        items.push(newEntry);
        didMutate = true;
        appliedSummaries.push(
          `Đã cập nhật **${newEntry.name}**: cần chuẩn bị **${newEntry.quantityRequired}** ${newEntry.unit}, đã có **${newEntry.quantityOwned}**, còn thiếu **${newEntry.quantityMissing}**.`,
        );
      }
    }
  }

  return {
    items,
    removedItemCodes: Array.from(removedSet),
    appliedSummaries,
    clarificationQuestions,
    didMutate,
  };
}
