import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AiConversation,
  AiConversationDocument,
  Booking,
  BookingDocument,
  Checklist,
  ChecklistDocument,
  ChecklistEntry,
  ChecklistVersionChange,
  GearAvailability,
  GearAvailabilityDocument,
  GearItem,
  GearItemDocument,
  GearRule,
  GearRuleDocument,
  Profile,
  ProfileDocument,
  TravelPlan,
  TravelPlanDocument,
} from '../../database/schemas';
import {
  ActivityType,
  BookingStatus,
  ChecklistPriority,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
} from '../../common/enums/system.enums';
import { AvailabilityService } from '../gear/availability.service';
import {
  AddChecklistItemDto,
  MatchChecklistGearDto,
  UpdateChecklistItemDto,
} from './dto/checklist.dto';
import {
  applyStructuredChecklistOperations,
  buildChecklistEntriesFromRules,
  computeChecklistEntryNote,
  GEAR_CATALOG_METADATA,
  normalizeChecklistEntry,
} from './checklist-mutation.engine';

export interface ChecklistRuleTemplate {
  activity: ActivityType;
  categoryCode: string;
  itemName: string;
  unit: string;
  priority: ChecklistPriority;
  scalingRule: 'PER_PERSON' | 'SHARED_2_3' | 'ONE_PER_GROUP' | 'PER_PERSON_DAY_2L' | 'PER_PERSON_DAY';
  canRent: boolean;
  overnightOnly?: boolean;
  defaultAttributes?: Record<string, any>;
  reasonTemplate: string;
}

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

const CONDITION_SCORE: Record<string, number> = {
  [GearCondition.NEW]: 4,
  [GearCondition.LIKE_NEW]: 3,
  [GearCondition.GOOD]: 2,
  [GearCondition.FAIR]: 1,
};

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectModel(TravelPlan.name)
    private readonly travelPlanModel: Model<TravelPlanDocument>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<ChecklistDocument>,
    @InjectModel(AiConversation.name)
    private readonly aiConversationModel: Model<AiConversationDocument>,
    @InjectModel(GearRule.name)
    private readonly gearRuleModel: Model<GearRuleDocument>,
    @InjectModel(GearItem.name)
    private readonly gearItemModel: Model<GearItemDocument>,
    @InjectModel(GearAvailability.name)
    private readonly availabilityModel: Model<GearAvailabilityDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    private readonly availabilityService: AvailabilityService,
  ) {}

  private assertPlanOwnership(
    plan: any,
    currentUserId: string,
  ): asserts plan is Record<string, any> {
    if (!plan) {
      throw new NotFoundException('Không tìm thấy kế hoạch chuyến đi (TravelPlan)');
    }
    if (String(plan.userId) !== String(currentUserId)) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập hoặc tạo checklist cho kế hoạch chuyến đi của người dùng khác',
      );
    }
  }

  private assertChecklistOwnership(
    checklist: any,
    currentUserId: string,
  ): asserts checklist is Record<string, any> {
    if (!checklist) {
      throw new NotFoundException('Không tìm thấy danh sách đồ cần chuẩn bị (Checklist)');
    }
    if (String(checklist.userId) !== String(currentUserId)) {
      throw new ForbiddenException(
        'Bạn không có quyền xem hoặc chỉnh sửa checklist của người dùng khác',
      );
    }
  }

  /**
   * Normalize Vietnamese text (lowercase, remove diacritics, collapse spaces)
   */
  private normalizeViText(input?: string | null): string {
    if (!input) return '';
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Haversine distance in kilometers between two [lng, lat] points
   */
  private calculateDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  /**
   * Build checklist items for a TravelPlan while preserving user-edited `quantityOwned`, `quantityRequired`,
   * custom items (`isCustomItem`), removed items (`removedItemCodes`), and `requiredAttributes`
   */
  async buildChecklistEntriesForPlan(
    plan: {
      activity: ActivityType;
      durationDays: number;
      travelers: number;
      ownedGearCodes?: string[];
      ownedGearQuantities?: Record<string, number>;
      requiredGearQuantities?: Record<string, number>;
      removedGearCodes?: string[];
      customGearItems?: Array<{
        categoryCode: string;
        itemName: string;
        quantityRequired: number;
        unit?: string;
      }>;
    },
    previousItems: ChecklistEntry[] = [],
    options?: {
      removedItemCodes?: string[];
      didTravelersOrDurationChange?: boolean;
      didTravelersChange?: boolean;
    },
  ): Promise<ChecklistEntry[]> {
    const rawActivity = plan.activity || ActivityType.TREKKING;
    const effectiveActivity =
      rawActivity === ActivityType.CAMPING ||
      rawActivity === ActivityType.BEACH_CAMPING
        ? ActivityType.CAMPING
        : ActivityType.TREKKING;

    const dbRules = await this.gearRuleModel
      .find({ activity: effectiveActivity })
      .lean();

    const mergedRemoved = Array.from(
      new Set([
        ...(options?.removedItemCodes || []),
        ...(plan.removedGearCodes || []),
      ]),
    );

    return buildChecklistEntriesFromRules({
      activity: effectiveActivity,
      durationDays: plan.durationDays,
      travelers: plan.travelers,
      ownedGearCodes: plan.ownedGearCodes || [],
      ownedGearQuantities: plan.ownedGearQuantities || {},
      requiredGearQuantities: plan.requiredGearQuantities || {},
      customGearItems: plan.customGearItems || [],
      dbRules: dbRules || [],
      previousItems,
      removedItemCodes: mergedRemoved,
      didTravelersOrDurationChange: Boolean(
        options?.didTravelersOrDurationChange,
      ),
      didTravelersChange: Boolean(options?.didTravelersChange),
    });
  }

  private async syncAiConversationFromChecklist(
    checklist: any,
    items: ChecklistEntry[],
    removedItemCodes: string[] = [],
  ): Promise<void> {
    if (!checklist?.aiConversationId) return;
    try {
      const conv = await this.aiConversationModel
        .findById(checklist.aiConversationId)
        .lean();
      if (!conv) return;
      const tripState = { ...(conv.tripState || conv.parsedRequirements || {}) } as Record<string, any>;
      const ownedSet = new Set<string>(
        Array.isArray(tripState.ownedGear) ? tripState.ownedGear : [],
      );
      const ownedQuantities: Record<string, number> = {
        ...(tripState.ownedGearQuantities || {}),
      };
      for (const item of items) {
        if (item.quantityOwned > 0) {
          ownedSet.add(item.categoryCode);
          ownedQuantities[item.categoryCode] = item.quantityOwned;
        } else if (item.userEditedOwned && item.quantityOwned === 0) {
          ownedSet.delete(item.categoryCode);
          delete ownedQuantities[item.categoryCode];
        }
      }
      for (const rem of removedItemCodes) {
        ownedSet.delete(rem);
        delete ownedQuantities[rem];
      }
      tripState.ownedGear = Array.from(ownedSet);
      tripState.ownedGearQuantities = ownedQuantities;

      await this.aiConversationModel.findByIdAndUpdate(
        checklist.aiConversationId,
        {
          $set: {
            tripState,
            parsedRequirements: tripState,
          },
        },
      );
    } catch {
      // Non-blocking sync
    }
  }

  /**
   * POST /api/v1/travel-plans/:id/checklist
   * Create or return current checklist for a TravelPlan (idempotent when planVersion is unchanged;
   * preserves user-edited `quantityOwned`, `quantityRequired`, `isCustomItem`, `removedItemCodes` when planVersion advances).
   */
  async generateOrGetChecklistForPlan(
    currentUserId: string,
    travelPlanId: string,
    options?: { forceRegenerate?: boolean },
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(travelPlanId)) {
      throw new NotFoundException('Mã kế hoạch chuyến đi (travelPlanId) không hợp lệ');
    }

    const plan = await this.travelPlanModel.findById(travelPlanId).lean();
    this.assertPlanOwnership(plan, currentUserId);

    if (
      !plan.activity ||
      !plan.durationDays ||
      plan.durationDays < 1 ||
      !plan.travelers ||
      plan.travelers < 1
    ) {
      throw new BadRequestException(
        'Kế hoạch chuyến đi chưa đủ thông tin bắt buộc (hoạt động, số ngày, số người) để tạo checklist',
      );
    }

    const currentPlanVersion = Number(plan.planVersion) || 1;
    const existingChecklist = await this.checklistModel
      .findOne({ travelPlanId: new Types.ObjectId(travelPlanId) })
      .lean();

    if (
      existingChecklist &&
      !options?.forceRegenerate &&
      Number(existingChecklist.planVersion || 1) === currentPlanVersion
    ) {
      return this.formatChecklist(existingChecklist, plan);
    }

    const removedItemCodes = Array.isArray(existingChecklist?.removedItemCodes)
      ? existingChecklist.removedItemCodes
      : [];

    const didPlanVersionAdvance =
      Boolean(existingChecklist) &&
      Number(existingChecklist?.planVersion || 1) !== currentPlanVersion;

    const nextItems = await this.buildChecklistEntriesForPlan(
      {
        activity: plan.activity,
        durationDays: plan.durationDays,
        travelers: plan.travelers,
        ownedGearCodes: plan.ownedGearCodes || [],
        ownedGearQuantities: (plan as any).ownedGearQuantities || {},
        requiredGearQuantities: (plan as any).requiredGearQuantities || {},
        removedGearCodes: (plan as any).removedGearCodes || [],
        customGearItems: (plan as any).customGearItems || [],
      },
      existingChecklist?.items || [],
      {
        removedItemCodes,
        didTravelersOrDurationChange: didPlanVersionAdvance,
        didTravelersChange: false, // Manual overrides stay intact on explicit Tạo/Đồng bộ checklist
      },
    );

    const title = `Checklist ${plan.destination || 'Chuyến đi'} (${plan.durationDays} ngày • ${plan.travelers} người)`;

    if (existingChecklist) {
      const currentVer = Number(existingChecklist.checklistVersion) || 1;
      const nextChecklistVersion = currentVer + 1;
      const nextHistory = this.appendChecklistVersionHistory(
        existingChecklist.versionHistory,
        {
          version: nextChecklistVersion,
          scope: 'GLOBAL',
          action: 'REGENERATE',
        },
      );
      const updated = await this.checklistModel
        .findByIdAndUpdate(
          existingChecklist._id,
          {
            $set: {
              title,
              planVersion: currentPlanVersion,
              checklistVersion: nextChecklistVersion,
              items: nextItems,
              removedItemCodes,
              versionHistory: nextHistory,
            },
          },
          { new: true },
        )
        .lean();

      return this.formatChecklist(
        updated || {
          ...existingChecklist,
          title,
          planVersion: currentPlanVersion,
          checklistVersion: nextChecklistVersion,
          items: nextItems,
          removedItemCodes,
          versionHistory: nextHistory,
        },
        plan,
      );
    }

    const created = await this.checklistModel.create({
      userId: new Types.ObjectId(String(currentUserId)),
      travelPlanId: new Types.ObjectId(travelPlanId),
      aiConversationId: plan.aiConversationId,
      title,
      planVersion: currentPlanVersion,
      checklistVersion: 1,
      items: nextItems,
      removedItemCodes: Array.isArray((plan as any).removedGearCodes)
        ? (plan as any).removedGearCodes
        : [],
    });

    if (plan.aiConversationId) {
      await this.aiConversationModel.findByIdAndUpdate(plan.aiConversationId, {
        $set: { checklistId: created._id },
      });
    }

    return this.formatChecklist(created.toObject(), plan);
  }

  /**
   * GET /api/v1/checklists/:id
   */
  async getChecklistById(
    currentUserId: string,
    checklistId: string,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(checklistId)) {
      throw new NotFoundException('Mã checklist không hợp lệ');
    }

    const checklist = await this.checklistModel.findById(checklistId).lean();
    this.assertChecklistOwnership(checklist, currentUserId);

    let plan: any = null;
    if (checklist.travelPlanId) {
      plan = await this.travelPlanModel.findById(checklist.travelPlanId).lean();
    }

    return this.formatChecklist(checklist, plan);
  }

  private appendChecklistVersionHistory(
    existing: ChecklistVersionChange[] | undefined,
    entry: ChecklistVersionChange,
  ): ChecklistVersionChange[] {
    const base = Array.isArray(existing) ? existing : [];
    return [...base, entry].slice(-30);
  }

  private async throwVersionConflict(
    checklist: any,
    expectedVersion: number | undefined,
    message: string,
  ): Promise<never> {
    let plan: any = null;
    if (checklist?.travelPlanId) {
      plan = await this.travelPlanModel.findById(checklist.travelPlanId).lean();
    }
    throw new ConflictException({
      statusCode: 409,
      code: 'CHECKLIST_VERSION_CONFLICT',
      message,
      expectedChecklistVersion: expectedVersion ?? null,
      currentChecklistVersion: Number(checklist?.checklistVersion) || 1,
      checklist: this.formatChecklist(checklist, plan),
    });
  }

  /**
   * Optimistic concurrency control for checklist item mutations across tabs:
   * - If expectedVersion === currentVersion -> proceed normally
   * - If expectedVersion < currentVersion -> inspect intermediate `versionHistory`;
   *   if every intermediate version only touched OTHER items (`scope === 'ITEM'` with disjoint keys),
   *   allow safe merge onto latest `checklist`; otherwise throw 409 ConflictException asking client to reload.
   */
  private async assertOrResolveChecklistConcurrency(
    checklist: any,
    expectedVersion: number | undefined,
    targetItemKeys: string[],
  ): Promise<number> {
    const currentVer = Number(checklist.checklistVersion) || 1;
    if (expectedVersion === undefined || expectedVersion === null) {
      return currentVer;
    }

    if (expectedVersion > currentVer) {
      await this.throwVersionConflict(
        checklist,
        expectedVersion,
        'Phiên bản checklist gửi lên không hợp lệ. Vui lòng tải lại checklist mới nhất.',
      );
    }

    if (expectedVersion === currentVer) {
      return currentVer;
    }

    const history: ChecklistVersionChange[] = Array.isArray(
      checklist.versionHistory,
    )
      ? checklist.versionHistory
      : [];

    const normalizedTargets = new Set(
      targetItemKeys.filter(Boolean).map((k) => String(k).toUpperCase()),
    );

    for (let v = expectedVersion + 1; v <= currentVer; v++) {
      const change = history.find((h) => Number(h.version) === v);
      if (!change || change.scope !== 'ITEM') {
        await this.throwVersionConflict(
          checklist,
          expectedVersion,
          'Checklist vừa được thay đổi cấu trúc ở một tab hoặc phiên làm việc khác. Vui lòng tải lại checklist mới nhất trước khi tiếp tục.',
        );
        return currentVer;
      }
      const touched = (change.itemKeys || []).map((k) =>
        String(k).toUpperCase(),
      );
      if (touched.some((k) => normalizedTargets.has(k))) {
        await this.throwVersionConflict(
          checklist,
          expectedVersion,
          'Hạng mục này vừa được chỉnh sửa ở một tab khác. Vui lòng tải lại checklist mới nhất để tránh ghi đè dữ liệu.',
        );
      }
    }

    // All intermediate versions only updated unrelated items -> safe to merge onto latest snapshot
    return currentVer;
  }

  private async atomicSaveChecklistVersion(
    checklist: any,
    expectedWriteVersion: number,
    setPayload: Record<string, any>,
    strictConcurrency: boolean,
  ): Promise<any> {
    const modelAny = this.checklistModel as any;
    if (typeof modelAny.findOneAndUpdate === 'function') {
      const updated = await modelAny
        .findOneAndUpdate(
          {
            _id: checklist._id,
            checklistVersion: expectedWriteVersion,
          },
          { $set: setPayload },
          { new: true },
        )
        .lean();

      if (!updated) {
        const latest =
          (await this.checklistModel.findById(checklist._id).lean()) ||
          checklist;
        await this.throwVersionConflict(
          latest,
          expectedWriteVersion,
          'Checklist vừa được cập nhật đồng thời từ một tab khác. Vui lòng tải lại checklist mới nhất.',
        );
      }
      return updated;
    }

    if (strictConcurrency) {
      const latest = await this.checklistModel.findById(checklist._id).lean();
      if (
        !latest ||
        (Number(latest.checklistVersion) || 1) !== expectedWriteVersion
      ) {
        await this.throwVersionConflict(
          latest || checklist,
          expectedWriteVersion,
          'Checklist vừa được cập nhật đồng thời từ một tab khác. Vui lòng tải lại checklist mới nhất.',
        );
      }
    }

    return await this.checklistModel
      .findByIdAndUpdate(checklist._id, { $set: setPayload }, { new: true })
      .lean();
  }

  /**
   * PATCH /api/v1/checklists/:id/items/:itemId
   * Shared checklist mutation logic for UI & Chat:
   * Updates `quantityOwned`, `quantityRequired`, `ownedConfirmed`, or `requiredAttributes` (e.g. shoe size)
   */
  async updateChecklistItem(
    currentUserId: string,
    checklistId: string,
    itemIdOrCategoryCode: string,
    dto: UpdateChecklistItemDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(checklistId)) {
      throw new NotFoundException('Mã checklist không hợp lệ');
    }

    const checklist = await this.checklistModel.findById(checklistId).lean();
    this.assertChecklistOwnership(checklist, currentUserId);

    if (dto.quantityOwned !== undefined) {
      if (
        typeof dto.quantityOwned !== 'number' ||
        !Number.isInteger(dto.quantityOwned) ||
        dto.quantityOwned < 0
      ) {
        throw new BadRequestException(
          'Số lượng đã có (quantityOwned) phải là số nguyên không âm (>= 0)',
        );
      }
    }

    if (dto.quantityRequired !== undefined) {
      if (
        typeof dto.quantityRequired !== 'number' ||
        !Number.isInteger(dto.quantityRequired) ||
        dto.quantityRequired < 1
      ) {
        throw new BadRequestException(
          'Số lượng cần chuẩn bị (quantityRequired) phải là số nguyên dương (>= 1)',
        );
      }
    }

    const normalizedTarget = String(itemIdOrCategoryCode).trim();
    const items = (checklist.items || []).map((entry: any) =>
      normalizeChecklistEntry(entry),
    );
    const idx = items.findIndex(
      (i) =>
        i.itemId === normalizedTarget ||
        String(i.categoryCode).toUpperCase() === normalizedTarget.toUpperCase() ||
        `item_${String(i.categoryCode).toUpperCase()}` === normalizedTarget,
    );

    if (idx === -1) {
      throw new NotFoundException(
        `Không tìm thấy hạng mục "${itemIdOrCategoryCode}" trong checklist`,
      );
    }

    const target = items[idx];
    const currentWriteVersion = await this.assertOrResolveChecklistConcurrency(
      checklist,
      dto.expectedChecklistVersion,
      [target.itemId, target.categoryCode],
    );
    let nextItems = items;
    let removedItemCodes: string[] = Array.isArray(checklist.removedItemCodes)
      ? [...checklist.removedItemCodes]
      : [];

    // Delegate quantityRequired / quantityOwned updates to the shared checklist mutation engine
    const ops: any[] = [];
    if (dto.quantityRequired !== undefined) {
      ops.push({
        intent: 'SET_REQUIRED',
        categoryCode: target.categoryCode,
        itemName: target.name,
        quantity: dto.quantityRequired,
        rawSegment: `UI SET_REQUIRED ${dto.quantityRequired}`,
      });
    }
    if (dto.quantityOwned !== undefined) {
      ops.push({
        intent: 'SET_OWNED',
        categoryCode: target.categoryCode,
        itemName: target.name,
        quantity: dto.quantityOwned,
        rawSegment: `UI SET_OWNED ${dto.quantityOwned}`,
      });
    }

    if (ops.length > 0) {
      const mut = applyStructuredChecklistOperations({
        items: nextItems,
        removedItemCodes,
        operations: ops,
        isChecklistReady: true,
      });
      nextItems = mut.items;
      removedItemCodes = mut.removedItemCodes;
    }

    const updatedIdx = nextItems.findIndex(
      (i) => i.itemId === target.itemId || i.categoryCode === target.categoryCode,
    );

    if (updatedIdx !== -1) {
      const updatedTarget = { ...nextItems[updatedIdx] };

      if (dto.ownedConfirmed !== undefined) {
        updatedTarget.ownedConfirmed = Boolean(dto.ownedConfirmed);
        if (updatedTarget.ownedConfirmed) {
          updatedTarget.userEditedOwned = true;
        }
      }

      if (
        dto.requiredAttributes !== undefined &&
        dto.requiredAttributes !== null
      ) {
        const cleanedAttrs: Record<string, any> = {
          ...(updatedTarget.requiredAttributes || {}),
        };
        for (const [k, v] of Object.entries(dto.requiredAttributes)) {
          if (v === null || v === undefined || String(v).trim() === '') {
            delete cleanedAttrs[k];
          } else {
            cleanedAttrs[k] = v;
          }
        }
        updatedTarget.requiredAttributes = cleanedAttrs;
      }

      updatedTarget.quantityMissing = Math.max(
        0,
        updatedTarget.quantityRequired - updatedTarget.quantityOwned,
      );

      if (dto.note !== undefined) {
        updatedTarget.note = dto.note;
      } else {
        updatedTarget.note = computeChecklistEntryNote({
          canRent: updatedTarget.canRent,
          ownedConfirmed: updatedTarget.ownedConfirmed,
          quantityMissing: updatedTarget.quantityMissing,
        });
      }

      nextItems[updatedIdx] = normalizeChecklistEntry(updatedTarget);
    }

    const nextChecklistVersion = currentWriteVersion + 1;
    const nextHistory = this.appendChecklistVersionHistory(
      checklist.versionHistory,
      {
        version: nextChecklistVersion,
        scope: 'ITEM',
        itemKeys: [target.itemId, target.categoryCode],
        action: 'UPDATE_ITEM',
      },
    );

    const updated = await this.atomicSaveChecklistVersion(
      checklist,
      currentWriteVersion,
      {
        items: nextItems,
        removedItemCodes,
        checklistVersion: nextChecklistVersion,
        versionHistory: nextHistory,
      },
      dto.expectedChecklistVersion !== undefined,
    );

    await this.syncAiConversationFromChecklist(
      checklist,
      nextItems,
      removedItemCodes,
    );

    let plan: any = null;
    if (checklist.travelPlanId) {
      plan = await this.travelPlanModel.findById(checklist.travelPlanId).lean();
    }

    return this.formatChecklist(
      updated || {
        ...checklist,
        items: nextItems,
        removedItemCodes,
        checklistVersion: nextChecklistVersion,
      },
      plan,
    );
  }

  /**
   * POST /api/v1/checklists/:id/items
   * Add a new item to the checklist via the shared mutation engine (`ADD_ITEM`)
   */
  async addChecklistItem(
    currentUserId: string,
    checklistId: string,
    dto: AddChecklistItemDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(checklistId)) {
      throw new NotFoundException('Mã checklist không hợp lệ');
    }

    const checklist = await this.checklistModel.findById(checklistId).lean();
    this.assertChecklistOwnership(checklist, currentUserId);

    const rawName = (dto.name || '').trim();
    if (!rawName) {
      throw new BadRequestException('Tên hạng mục đồ cần thêm không được để trống');
    }

    const code = (
      dto.categoryCode?.trim() ||
      rawName
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Đ/g, 'D')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') ||
      'CUSTOM_ITEM'
    ).toUpperCase();

    const qtyReq = Math.max(1, Math.floor(Number(dto.quantityRequired) || 1));

    const currentWriteVersion = await this.assertOrResolveChecklistConcurrency(
      checklist,
      dto.expectedChecklistVersion,
      [code, `item_${code.toLowerCase()}`],
    );

    const ops: any[] = [
      {
        intent: 'ADD_ITEM',
        categoryCode: code,
        itemName: GEAR_CATALOG_METADATA[code]?.defaultItemName || rawName,
        quantity: qtyReq,
        unit: dto.unit || GEAR_CATALOG_METADATA[code]?.unit || 'chiếc',
        rawSegment: `UI ADD_ITEM ${rawName}`,
      },
    ];

    if (
      dto.quantityOwned !== undefined &&
      Number.isInteger(dto.quantityOwned) &&
      dto.quantityOwned >= 0
    ) {
      ops.push({
        intent: 'SET_OWNED',
        categoryCode: code,
        itemName: GEAR_CATALOG_METADATA[code]?.defaultItemName || rawName,
        quantity: dto.quantityOwned,
        rawSegment: `UI SET_OWNED ${dto.quantityOwned}`,
      });
    }

    const mut = applyStructuredChecklistOperations({
      items: checklist.items || [],
      removedItemCodes: checklist.removedItemCodes || [],
      operations: ops,
      isChecklistReady: true,
    });

    const nextChecklistVersion = currentWriteVersion + 1;
    const nextHistory = this.appendChecklistVersionHistory(
      checklist.versionHistory,
      {
        version: nextChecklistVersion,
        scope: 'ITEM',
        itemKeys: [code, `item_${code.toLowerCase()}`],
        action: 'ADD_ITEM',
      },
    );

    const updated = await this.atomicSaveChecklistVersion(
      checklist,
      currentWriteVersion,
      {
        items: mut.items,
        removedItemCodes: mut.removedItemCodes,
        checklistVersion: nextChecklistVersion,
        versionHistory: nextHistory,
      },
      dto.expectedChecklistVersion !== undefined,
    );

    await this.syncAiConversationFromChecklist(
      checklist,
      mut.items,
      mut.removedItemCodes,
    );

    let plan: any = null;
    if (checklist.travelPlanId) {
      plan = await this.travelPlanModel.findById(checklist.travelPlanId).lean();
    }

    return this.formatChecklist(
      updated || {
        ...checklist,
        items: mut.items,
        removedItemCodes: mut.removedItemCodes,
        checklistVersion: nextChecklistVersion,
      },
      plan,
    );
  }

  /**
   * DELETE /api/v1/checklists/:id/items/:itemId
   * Remove an item from the active checklist via the shared mutation engine (`REMOVE_ITEM`)
   */
  async removeChecklistItem(
    currentUserId: string,
    checklistId: string,
    itemIdOrCategoryCode: string,
    expectedChecklistVersion?: number,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(checklistId)) {
      throw new NotFoundException('Mã checklist không hợp lệ');
    }

    const checklist = await this.checklistModel.findById(checklistId).lean();
    this.assertChecklistOwnership(checklist, currentUserId);

    const normalizedTarget = String(itemIdOrCategoryCode)
      .trim()
      .replace(/^item_/i, '')
      .toUpperCase();

    const existing = (checklist.items || []).find(
      (i: any) =>
        i.itemId === itemIdOrCategoryCode ||
        String(i.categoryCode).toUpperCase() === normalizedTarget,
    );

    if (!existing) {
      throw new NotFoundException(
        `Không tìm thấy hạng mục "${itemIdOrCategoryCode}" trong checklist`,
      );
    }

    const currentWriteVersion = await this.assertOrResolveChecklistConcurrency(
      checklist,
      expectedChecklistVersion,
      [existing.itemId, existing.categoryCode],
    );

    const mut = applyStructuredChecklistOperations({
      items: checklist.items || [],
      removedItemCodes: checklist.removedItemCodes || [],
      operations: [
        {
          intent: 'REMOVE_ITEM',
          categoryCode: existing.categoryCode,
          itemName: existing.name,
          quantity: null,
          rawSegment: `UI REMOVE_ITEM ${existing.categoryCode}`,
        },
      ],
      isChecklistReady: true,
    });

    const nextChecklistVersion = currentWriteVersion + 1;
    const nextHistory = this.appendChecklistVersionHistory(
      checklist.versionHistory,
      {
        version: nextChecklistVersion,
        scope: 'ITEM',
        itemKeys: [existing.itemId, existing.categoryCode],
        action: 'REMOVE_ITEM',
      },
    );

    const updated = await this.atomicSaveChecklistVersion(
      checklist,
      currentWriteVersion,
      {
        items: mut.items,
        removedItemCodes: mut.removedItemCodes,
        checklistVersion: nextChecklistVersion,
        versionHistory: nextHistory,
      },
      expectedChecklistVersion !== undefined,
    );

    await this.syncAiConversationFromChecklist(
      checklist,
      mut.items,
      mut.removedItemCodes,
    );

    let plan: any = null;
    if (checklist.travelPlanId) {
      plan = await this.travelPlanModel.findById(checklist.travelPlanId).lean();
    }

    return this.formatChecklist(
      updated || {
        ...checklist,
        items: mut.items,
        removedItemCodes: mut.removedItemCodes,
        checklistVersion: nextChecklistVersion,
      },
      plan,
    );
  }

  /**
   * POST /api/v1/checklists/:id/matches
   * Match missing rentable checklist items against public active GearItems, AvailabilityService, area, attributes, and budget.
   */
  async matchMissingGear(
    currentUserId: string,
    checklistId: string,
    dto: MatchChecklistGearDto,
  ): Promise<Record<string, any>> {
    if (!Types.ObjectId.isValid(checklistId)) {
      throw new NotFoundException('Mã checklist không hợp lệ');
    }

    const checklist = await this.checklistModel.findById(checklistId).lean();
    this.assertChecklistOwnership(checklist, currentUserId);

    // 1. Validate rental interval [startAt, endAt) using AvailabilityService
    const {
      startAt: start,
      endAt: end,
      rentalDays,
    } = this.availabilityService.parseAndValidateInterval(
      dto.startAt,
      dto.endAt,
    );

    // 2. Validate budgetVnd (null/empty = no limit; 0 = free loan only; > 0 = VND cap)
    let hasBudgetLimit = false;
    let budgetVnd: number | null = null;
    if (
      dto.budgetVnd !== undefined &&
      dto.budgetVnd !== null &&
      String(dto.budgetVnd).trim() !== ''
    ) {
      const parsedBudget = Number(dto.budgetVnd);
      if (isNaN(parsedBudget) || parsedBudget < 0) {
        throw new BadRequestException('Ngân sách (budgetVnd) không hợp lệ');
      }
      hasBudgetLimit = true;
      budgetVnd = parsedBudget;
    }

    // 3. Area filter tokens
    const rawPickupArea = [dto.pickupArea, dto.district, dto.city]
      .filter((s) => Boolean(s && String(s).trim()))
      .join(', ');
    const areaTokens = rawPickupArea
      .split(/[,;-]+/)
      .map((part) => this.normalizeViText(part))
      .filter(Boolean);

    const hasGeoFilter =
      typeof dto.lat === 'number' &&
      !isNaN(dto.lat) &&
      typeof dto.lng === 'number' &&
      !isNaN(dto.lng);
    const radiusKm = Number(dto.radiusKm) || 25;

    const removedSet = new Set(
      (checklist.removedItemCodes || []).map((c: string) =>
        String(c).toUpperCase(),
      ),
    );

    const allItems: ChecklistEntry[] = (checklist.items || [])
      .filter(
        (item: any) =>
          !removedSet.has(String(item.categoryCode || '').toUpperCase()) &&
          !removedSet.has(String(item.itemId || '').toUpperCase()),
      )
      .map((item: any) => normalizeChecklistEntry(item));

    // Only match items with canRent === true AND quantityMissing > 0
    const neededRentableItems = allItems.filter(
      (i) => i.canRent && i.quantityMissing > 0,
    );
    const nonRentableItems = allItems.filter((i) => !i.canRent);
    const unconfirmedOwnedItems = allItems.filter(
      (i) => i.canRent && !i.ownedConfirmed,
    );

    const itemMatches: Array<Record<string, any>> = [];
    const unmatchedItems: Array<Record<string, any>> = [];

    for (const item of neededRentableItems) {
      const categoryCode = String(item.categoryCode).toUpperCase();

      // Fetch all public active listings in this category
      const categoryListings = await this.gearItemModel
        .find({
          categoryCode,
          status: GearStatus.ACTIVE,
          moderationStatus: GearModerationStatus.APPROVED,
          isActive: true,
        })
        .lean();

      const totalInCategory = categoryListings.length;
      let passedAreaCount = 0;
      let passedAttributesCount = 0;
      let passedScheduleCount = 0;
      let passedSharingAndBudgetCount = 0;

      const passingCandidates: Array<Record<string, any>> = [];

      // Preload owner profiles for candidate cards
      const ownerIds = Array.from(
        new Set(categoryListings.map((g: any) => String(g.ownerId))),
      ).map((id) => new Types.ObjectId(id));
      const profiles =
        ownerIds.length > 0
          ? await this.profileModel
              .find({ userId: { $in: ownerIds } })
              .lean()
          : [];
      const profileMap = new Map<string, any>();
      for (const p of profiles) {
        profileMap.set(String(p.userId), p);
      }

      for (const gear of categoryListings as any[]) {
        // Filter 1: Area / Geo radius
        const gearAreaText = this.normalizeViText(
          `${gear.district || ''} ${gear.city || ''}`,
        );
        let areaMatched = true;
        let exactDistrictMatched = false;
        let distanceKm: number | null = null;

        if (areaTokens.length > 0) {
          areaMatched = areaTokens.every((token) =>
            gearAreaText.includes(token),
          );
          if (
            areaMatched &&
            gear.district &&
            areaTokens.some((t) =>
              this.normalizeViText(gear.district).includes(t),
            )
          ) {
            exactDistrictMatched = true;
          }
        }

        if (
          hasGeoFilter &&
          Array.isArray(gear.pickupLocation?.coordinates) &&
          gear.pickupLocation.coordinates.length === 2
        ) {
          const [gearLng, gearLat] = gear.pickupLocation.coordinates;
          distanceKm = this.calculateDistanceKm(
            dto.lat!,
            dto.lng!,
            gearLat,
            gearLng,
          );
          if (areaTokens.length === 0 && distanceKm > radiusKm) {
            areaMatched = false;
          }
        }

        if (!areaMatched) {
          continue;
        }
        passedAreaCount++;

        // Filter 2: Required attributes (e.g. shoe size / clothing size)
        const reqAttrs = item.requiredAttributes || {};
        const reqSizeRaw =
          reqAttrs.size ?? reqAttrs.sizeEu ?? reqAttrs.shoeSize ?? null;
        let attrMatched = true;
        let attrMatchScore = 0;

        if (
          reqSizeRaw !== null &&
          reqSizeRaw !== undefined &&
          String(reqSizeRaw).trim() !== ''
        ) {
          const requestedSizes = String(reqSizeRaw)
            .split(/[,;/\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          const gearSizeVal =
            gear.attributes?.sizeEu ??
            gear.attributes?.size ??
            gear.attributes?.shoeSize ??
            null;
          const gearSizeStr =
            gearSizeVal !== null && gearSizeVal !== undefined
              ? String(gearSizeVal).trim().toLowerCase()
              : '';

          if (
            !gearSizeStr ||
            !requestedSizes.some((rs) => gearSizeStr === rs)
          ) {
            attrMatched = false;
          } else {
            attrMatchScore += 10;
          }
        }

        if (!attrMatched) {
          continue;
        }
        passedAttributesCount++;

        // Filter 3: Availability in [startAt, endAt)
        // Check both GearAvailability records AND active overlapping Bookings
        const overlappingBlocks = await this.availabilityModel
          .find({
            gearId: gear._id,
            startAt: { $lt: end },
            endAt: { $gt: start },
          })
          .lean();

        const activeOverlappingBookings = await this.bookingModel
          .find({
            gearId: gear._id,
            status: {
              $in: [
                BookingStatus.APPROVED,
                BookingStatus.IN_USE,
                BookingStatus.RETURN_PENDING,
              ],
            },
            startAt: { $lt: end },
            endAt: { $gt: start },
          })
          .lean();

        const blockedBookingIds = new Set(
          overlappingBlocks
            .filter((b: any) => b.bookingId)
            .map((b: any) => String(b.bookingId)),
        );

        const reservedFromAvailability = overlappingBlocks.reduce(
          (sum: number, b: any) => sum + (Number(b.reservedQuantity) || 1),
          0,
        );
        const reservedFromUnlinkedBookings = activeOverlappingBookings
          .filter((bk: any) => !blockedBookingIds.has(String(bk._id)))
          .reduce((sum: number, bk: any) => sum + (Number(bk.quantity) || 1), 0);

        const totalReserved =
          reservedFromAvailability + reservedFromUnlinkedBookings;
        const totalQuantity = Math.max(1, Number(gear.totalQuantity) || 1);
        const availableQuantity = Math.max(0, totalQuantity - totalReserved);

        if (availableQuantity < 1) {
          continue;
        }
        passedScheduleCount++;

        // Filter 4: Sharing type & Budget filter
        const gearSharingType: GearListingType =
          gear.sharingType || gear.listingType || GearListingType.RENT;
        const pricePerDay = Math.max(
          0,
          Number(gear.pricePerDay ?? gear.dailyPriceVnd ?? 0),
        );
        const depositPerUnit = Math.max(
          0,
          Number(gear.depositAmount ?? gear.depositAmountVnd ?? 0),
        );

        if (dto.sharingType) {
          if (
            dto.sharingType === GearListingType.FREE_LOAN &&
            gearSharingType !== GearListingType.FREE_LOAN &&
            gearSharingType !== GearListingType.BOTH &&
            pricePerDay > 0
          ) {
            continue;
          }
          if (
            dto.sharingType === GearListingType.RENT &&
            gearSharingType === GearListingType.FREE_LOAN
          ) {
            continue;
          }
        }

        const fulfillableQuantity = Math.min(
          item.quantityMissing,
          availableQuantity,
        );
        const unitRentalFee = rentalDays * pricePerDay;
        const estimatedRentalTotal =
          rentalDays * pricePerDay * fulfillableQuantity;
        const depositTotal = depositPerUnit * fulfillableQuantity;

        if (hasBudgetLimit && budgetVnd !== null) {
          if (budgetVnd === 0) {
            // Budget 0đ -> only free loan items (pricePerDay === 0 or FREE_LOAN)
            if (
              pricePerDay > 0 &&
              gearSharingType !== GearListingType.FREE_LOAN
            ) {
              continue;
            }
          } else {
            // At least 1 unit must be affordable within budgetVnd
            if (unitRentalFee > budgetVnd) {
              continue;
            }
          }
        }
        passedSharingAndBudgetCount++;

        const ownerProfile = profileMap.get(String(gear.ownerId));
        const conditionScore = CONDITION_SCORE[gear.condition] || 2;
        const coverageLabel = `Đáp ứng ${fulfillableQuantity}/${item.quantityMissing}`;
        const isFullCoverage = fulfillableQuantity >= item.quantityMissing;

        const reasonParts: string[] = [
          `Còn trống ${availableQuantity}/${totalQuantity} ${item.unit} tại ${gear.district}, ${gear.city}`,
          coverageLabel,
        ];
        if (attrMatchScore > 0 && reqSizeRaw) {
          reasonParts.push(`Đúng size ${reqSizeRaw}`);
        }
        if (pricePerDay === 0 || gearSharingType === GearListingType.FREE_LOAN) {
          reasonParts.push('Cho mượn miễn phí (0 ₫)');
        } else {
          reasonParts.push(
            `Phí thuê ${estimatedRentalTotal.toLocaleString('vi-VN')} ₫/${rentalDays} ngày`,
          );
        }

        passingCandidates.push({
          gearId: String(gear._id),
          id: String(gear._id),
          title: gear.title,
          categoryCode,
          brand: gear.brand || '',
          condition: gear.condition,
          conditionScore,
          sharingType: gearSharingType,
          images: gear.images || [],
          city: gear.city,
          district: gear.district,
          pickupAreaLabel: `${gear.district}, ${gear.city}`,
          distanceKm,
          exactDistrictMatched,
          attributes: gear.attributes || {},
          attributeMatchScore: attrMatchScore,
          totalQuantity,
          availableQuantity,
          fulfillableQuantity,
          quantityMissing: item.quantityMissing,
          coverageLabel,
          isFullCoverage,
          rentalDays,
          pricePerDay,
          unitRentalFee,
          estimatedRentalTotal,
          depositPerUnit,
          depositAmount: depositTotal,
          ratingAvg: Number(gear.ratingAvg) || 5.0,
          isOwnGear: String(gear.ownerId) === String(currentUserId),
          isDemo: Boolean(gear.isDemo),
          owner: {
            userId: String(gear.ownerId),
            username: ownerProfile?.username || 'member',
            fullName: ownerProfile?.fullName || 'Thành viên TravelShare',
            avatarUrl: ownerProfile?.avatarUrl || '',
            trustScore: ownerProfile?.trustScore ?? 4.9,
          },
          recommendationReason: reasonParts.join(' • '),
          bookingUrl: `/gear/${String(gear._id)}?startAt=${encodeURIComponent(
            dto.startAt,
          )}&endAt=${encodeURIComponent(dto.endAt)}&quantity=${fulfillableQuantity}`,
        });
      }

      // Deterministic ranking:
      // 1. Attribute match + condition score DESC
      // 2. Exact district match DESC / distanceKm ASC
      // 3. Lower daily rental fee (pricePerDay ASC)
      // 4. Higher ratingAvg DESC
      // 5. Tie-breaker: gearId ASC
      passingCandidates.sort((a, b) => {
        const scoreA = a.attributeMatchScore + a.conditionScore;
        const scoreB = b.attributeMatchScore + b.conditionScore;
        if (scoreB !== scoreA) return scoreB - scoreA;

        if (a.exactDistrictMatched !== b.exactDistrictMatched) {
          return a.exactDistrictMatched ? -1 : 1;
        }

        if (a.distanceKm !== null && b.distanceKm !== null) {
          if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        }

        if (a.pricePerDay !== b.pricePerDay) {
          return a.pricePerDay - b.pricePerDay;
        }

        if (b.ratingAvg !== a.ratingAvg) {
          return b.ratingAvg - a.ratingAvg;
        }

        return String(a.gearId).localeCompare(String(b.gearId));
      });

      // Compute how many units of `item.quantityMissing` can be fulfilled across all passing candidates
      let remainingToFulfill = item.quantityMissing;
      let minCostForItem = 0;
      let minDepositForItem = 0;

      const candidatesByCheapest = [...passingCandidates].sort(
        (a, b) =>
          a.pricePerDay - b.pricePerDay ||
          String(a.gearId).localeCompare(String(b.gearId)),
      );

      for (const cand of candidatesByCheapest) {
        if (remainingToFulfill <= 0) break;
        const take = Math.min(remainingToFulfill, cand.availableQuantity);
        minCostForItem += take * rentalDays * cand.pricePerDay;
        minDepositForItem += take * cand.depositPerUnit;
        remainingToFulfill -= take;
      }

      const totalFulfillableAcrossCandidates =
        item.quantityMissing - remainingToFulfill;
      const isItemFullyFulfillable = remainingToFulfill === 0;

      let unmatchedReason: string | null = null;
      if (passingCandidates.length === 0) {
        if (totalInCategory === 0) {
          unmatchedReason =
            'Hiện chưa có thiết bị thuộc danh mục này đang mở cho thuê trên hệ thống.';
        } else if (passedAreaCount === 0) {
          unmatchedReason = `Không có thiết bị cùng loại tại khu vực nhận đồ đã chọn (${rawPickupArea || 'khu vực yêu cầu'}).`;
        } else if (passedAttributesCount === 0) {
          const reqSize =
            item.requiredAttributes?.size ??
            item.requiredAttributes?.sizeEu ??
            JSON.stringify(item.requiredAttributes);
          unmatchedReason = `Không có thiết bị đáp ứng kích cỡ/thuộc tính yêu cầu (Size ${reqSize}).`;
        } else if (passedScheduleCount === 0) {
          unmatchedReason =
            'Các thiết bị cùng loại tại khu vực này đã kín lịch trong khoảng thời gian chọn.';
        } else if (passedSharingAndBudgetCount === 0) {
          if (hasBudgetLimit && budgetVnd === 0) {
            unmatchedReason =
              'Vượt ngân sách 0đ (không có thiết bị cho mượn miễn phí khả dụng trong khoảng ngày và khu vực này).';
          } else {
            unmatchedReason = `Chi phí thuê vượt quá ngân sách dự kiến (${Number(
              budgetVnd,
            ).toLocaleString('vi-VN')} ₫).`;
          }
        } else {
          unmatchedReason = 'Không tìm thấy thiết bị phù hợp với bộ lọc hiện tại.';
        }

        unmatchedItems.push({
          itemId: item.itemId,
          categoryCode,
          name: item.name,
          quantityRequired: item.quantityRequired,
          quantityOwned: item.quantityOwned,
          quantityMissing: item.quantityMissing,
          unit: item.unit,
          requiredAttributes: item.requiredAttributes,
          unmatchedReason,
        });
      }

      itemMatches.push({
        itemId: item.itemId,
        categoryCode,
        name: item.name,
        priority: item.priority,
        unit: item.unit,
        quantityRequired: item.quantityRequired,
        quantityNeeded: item.quantityRequired,
        quantityOwned: item.quantityOwned,
        quantityMissing: item.quantityMissing,
        requiredAttributes: item.requiredAttributes,
        totalFulfillableQuantity: totalFulfillableAcrossCandidates,
        isFullyFulfillable: isItemFullyFulfillable,
        coverageSummaryLabel: `Đáp ứng tối đa ${totalFulfillableAcrossCandidates}/${item.quantityMissing} ${item.unit}`,
        minEstimatedCostForItemVnd: minCostForItem,
        minDepositForItemVnd: minDepositForItem,
        unmatchedReason,
        candidates: passingCandidates,
      });
    }

    // 4. Overall Budget & Fulfillment Evaluation across the entire checklist
    const canFulfillAllItems =
      neededRentableItems.length > 0 &&
      itemMatches.every((m) => m.isFullyFulfillable);
    const minTotalEstimatedCostVnd = itemMatches.reduce(
      (sum, m) => sum + (Number(m.minEstimatedCostForItemVnd) || 0),
      0,
    );
    const minTotalDepositVnd = itemMatches.reduce(
      (sum, m) => sum + (Number(m.minDepositForItemVnd) || 0),
      0,
    );

    let isWithinTotalBudget = false;
    let budgetStatusLabel = 'Chưa đặt giới hạn ngân sách';

    if (neededRentableItems.length === 0) {
      isWithinTotalBudget = true;
      budgetStatusLabel = 'Đã có đủ thiết bị, không cần thuê thêm';
    } else if (hasBudgetLimit && budgetVnd !== null) {
      if (canFulfillAllItems && minTotalEstimatedCostVnd <= budgetVnd) {
        isWithinTotalBudget = true;
        budgetStatusLabel = 'Đủ đồ trong ngân sách';
      } else if (!canFulfillAllItems && minTotalEstimatedCostVnd <= budgetVnd) {
        isWithinTotalBudget = false;
        budgetStatusLabel =
          'Chưa đủ số lượng thiết bị đáp ứng toàn bộ checklist (dù chi phí phần tìm được nằm trong ngân sách)';
      } else {
        isWithinTotalBudget = false;
        budgetStatusLabel = `Tổng chi phí thuê tối thiểu (${minTotalEstimatedCostVnd.toLocaleString(
          'vi-VN',
        )} ₫) vượt ngân sách (${budgetVnd.toLocaleString('vi-VN')} ₫)`;
      }
    } else {
      isWithinTotalBudget = canFulfillAllItems;
      budgetStatusLabel = canFulfillAllItems
        ? 'Đủ thiết bị đáp ứng toàn bộ checklist'
        : 'Đáp ứng một phần số lượng thiết bị cần thuê';
    }

    return {
      checklistId: String(checklist._id),
      checklistVersion: Number(checklist.checklistVersion) || 1,
      planVersion: Number(checklist.planVersion) || 1,
      checkedAt: new Date().toISOString(),
      interval: {
        startAt: dto.startAt,
        endAt: dto.endAt,
        rentalDays,
      },
      filters: {
        pickupArea: rawPickupArea || null,
        budgetVnd,
        hasBudgetLimit,
        sharingType: dto.sharingType || null,
      },
      budgetSummary: {
        hasBudgetLimit,
        budgetVnd,
        minTotalEstimatedCostVnd,
        minTotalDepositVnd,
        canFulfillAllItems,
        isWithinTotalBudget,
        statusLabel: budgetStatusLabel,
      },
      itemMatches,
      unmatchedItems,
      nonRentableItems: nonRentableItems.map((i) => ({
        itemId: i.itemId,
        categoryCode: i.categoryCode,
        name: i.name,
        quantityRequired: i.quantityRequired,
        unit: i.unit,
        note: 'Tự chuẩn bị cá nhân (Không thuộc nhóm thuê)',
      })),
      unconfirmedOwnedItems: unconfirmedOwnedItems.map((i) => ({
        itemId: i.itemId,
        categoryCode: i.categoryCode,
        name: i.name,
        quantityRequired: i.quantityRequired,
        quantityOwned: i.quantityOwned,
        message: `Bạn đã đề cập có sẵn "${i.name}" trong hội thoại. Vui lòng xác nhận số lượng thực tế đang có.`,
      })),
    };
  }

  formatChecklist(checklist: any, plan?: any): Record<string, any> {
    if (!checklist) return {};
    const items = (checklist.items || []).map((item: any) => {
      const quantityRequired = Math.max(
        1,
        Number(item.quantityRequired ?? item.quantityNeeded ?? 1),
      );
      const quantityOwned = Math.max(0, Number(item.quantityOwned ?? 0));
      const quantityMissing = Math.max(0, quantityRequired - quantityOwned);
      const canRent = Boolean(item.canRent ?? item.isRentable ?? true);
      return {
        itemId: item.itemId || `item_${String(item.categoryCode).toUpperCase()}`,
        categoryCode: String(item.categoryCode).toUpperCase(),
        name: item.name,
        priority: item.priority || ChecklistPriority.ESSENTIAL,
        quantityRequired,
        quantityNeeded: quantityRequired,
        quantityOwned,
        quantityMissing,
        unit: item.unit || 'chiếc',
        canRent,
        isRentable: canRent,
        requiredAttributes: item.requiredAttributes || {},
        ownedConfirmed: item.ownedConfirmed !== false,
        userEditedOwned: Boolean(item.userEditedOwned),
        userEditedRequired: Boolean(item.userEditedRequired),
        isCustomItem: Boolean(item.isCustomItem),
        note: item.note || '',
        reason: item.reason || '',
      };
    });

    const totalRequiredItems = items.length;
    const totalRentableMissingCategories = items.filter(
      (i: any) => i.canRent && i.quantityMissing > 0,
    ).length;
    const totalMissingUnits = items
      .filter((i: any) => i.canRent)
      .reduce((sum: number, i: any) => sum + i.quantityMissing, 0);

    return {
      id: String(checklist._id),
      checklistId: String(checklist._id),
      userId: String(checklist.userId),
      travelPlanId: checklist.travelPlanId
        ? String(checklist.travelPlanId)
        : null,
      aiConversationId: checklist.aiConversationId
        ? String(checklist.aiConversationId)
        : null,
      title: checklist.title || 'Checklist chuyến đi',
      planVersion: Number(checklist.planVersion) || 1,
      checklistVersion: Number(checklist.checklistVersion) || 1,
      items,
      removedItemCodes: Array.isArray(checklist.removedItemCodes)
        ? checklist.removedItemCodes
        : [],
      summary: {
        totalCategories: totalRequiredItems,
        rentableMissingCategories: totalRentableMissingCategories,
        totalMissingRentableUnits: totalMissingUnits,
        unconfirmedCount: items.filter((i: any) => !i.ownedConfirmed).length,
      },
      travelPlan: plan
        ? {
            id: String(plan._id),
            destination: plan.destination,
            activity: plan.activity,
            durationDays: plan.durationDays,
            travelers: plan.travelers,
            departureDate: plan.departureDate
              ? new Date(plan.departureDate).toISOString().slice(0, 10)
              : null,
            budgetVnd: plan.budgetVnd ?? null,
            pickupArea: plan.pickupArea ?? null,
            planVersion: Number(plan.planVersion) || 1,
          }
        : undefined,
      createdAt: checklist.createdAt,
      updatedAt: checklist.updatedAt,
    };
  }
}
