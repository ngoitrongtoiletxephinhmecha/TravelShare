import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  normalizeLegacyActivity,
} from '../../common/enums/system.enums';
import {
  AvailabilityService,
  HOLDING_BOOKING_STATUSES,
} from '../gear/availability.service';
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
    @Optional()
    private readonly configService?: ConfigService,
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
      activity: ActivityType | string;
      environment?: string | null;
      isOvernight?: boolean | null;
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
    const normalized = normalizeLegacyActivity(
      plan.activity || ActivityType.TREKKING,
      plan.environment,
    );
    const effectiveActivity = normalized.activity || ActivityType.OTHER;
    const effectiveEnvironment = normalized.environment;

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
      environment: effectiveEnvironment,
      isOvernight: plan.isOvernight ?? null,
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
        environment: (plan as any).environment ?? null,
        isOvernight: (plan as any).isOvernight ?? null,
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

    if (
      dto.expectedChecklistVersion !== undefined &&
      Number(checklist.checklistVersion || 1) !==
        Number(dto.expectedChecklistVersion)
    ) {
      throw new ConflictException({
        code: 'CHECKLIST_VERSION_STALE',
        message:
          'Checklist vừa được cập nhật lên phiên bản mới hơn. Vui lòng tải lại checklist và thử tìm thiết bị lại.',
      });
    }

    // Only match items with canRent === true, ownedConfirmed !== false, AND quantityMissing > 0
    const neededRentableItems = allItems.filter(
      (i) => i.canRent && i.ownedConfirmed !== false && i.quantityMissing > 0,
    );
    const nonRentableItems = allItems.filter((i) => !i.canRent);
    const unconfirmedOwnedItems = allItems.filter(
      (i) => i.canRent && i.ownedConfirmed === false,
    );

    const neededCategoryCodes = Array.from(
      new Set(
        neededRentableItems.map((i) => String(i.categoryCode).toUpperCase()),
      ),
    );

    const isProduction = Boolean(
      this.configService?.get<boolean>('isProduction') ||
        this.configService?.get<string>('nodeEnv') === 'production' ||
        process.env.NODE_ENV === 'production',
    );

    // 4. Batched DB push-down (single query across all needed categories, excluding renter's own items)
    let allCandidateGearRaw: any[] = [];
    if (neededCategoryCodes.length > 0) {
      const gearFilter: Record<string, any> = {
        categoryCode:
          neededCategoryCodes.length === 1
            ? neededCategoryCodes[0]
            : { $in: neededCategoryCodes },
        ownerId: { $ne: new Types.ObjectId(String(currentUserId)) },
        status: GearStatus.ACTIVE,
        moderationStatus: GearModerationStatus.APPROVED,
        isActive: true,
        ...(isProduction ? { isDemo: { $ne: true } } : {}),
      };

      if (dto.sharingType === GearListingType.FREE_LOAN) {
        gearFilter.$or = [
          { sharingType: GearListingType.FREE_LOAN },
          { sharingType: GearListingType.BOTH },
          { pricePerDay: 0 },
        ];
      } else if (dto.sharingType === GearListingType.RENT) {
        gearFilter.sharingType = {
          $in: [GearListingType.RENT, GearListingType.BOTH],
        };
      }

      const gearQuery = this.gearItemModel.find(gearFilter);
      if (typeof (gearQuery as any).sort === 'function') {
        (gearQuery as any).sort({ pricePerDay: 1, ratingAvg: -1, _id: 1 });
      }
      allCandidateGearRaw = await gearQuery.lean();
    }

    // Defensive filter against non-eligible / renter-owned items even under simple mocks
    const eligibleListings = (allCandidateGearRaw || []).filter(
      (g: any) =>
        String(g.ownerId) !== String(currentUserId) &&
        this.availabilityService.isGearEligibleForBooking(g).eligible,
    );

    // Preload all owner profiles and all overlapping schedules in batch (eliminates N+1 queries)
    const distinctOwnerIds = Array.from(
      new Set(eligibleListings.map((g: any) => String(g.ownerId))),
    ).map((id) => new Types.ObjectId(id));

    const allGearObjIds = eligibleListings.map((g: any) => g._id);

    const [profiles, allOverlappingBlocks, allActiveBookings] =
      await Promise.all([
        distinctOwnerIds.length > 0
          ? this.profileModel
              .find({ userId: { $in: distinctOwnerIds } })
              .lean()
          : Promise.resolve([]),
        allGearObjIds.length > 0
          ? this.availabilityModel
              .find({
                gearId: { $in: allGearObjIds },
                startAt: { $lt: end },
                endAt: { $gt: start },
              })
              .lean()
          : Promise.resolve([]),
        allGearObjIds.length > 0
          ? this.bookingModel
              .find({
                gearId: { $in: allGearObjIds },
                status: { $in: HOLDING_BOOKING_STATUSES },
                startAt: { $lt: end },
                endAt: { $gt: start },
              })
              .lean()
          : Promise.resolve([]),
      ]);

    const profileMap = new Map<string, any>();
    for (const p of profiles) {
      profileMap.set(String(p.userId), p);
    }

    const blocksByGearId = new Map<string, any[]>();
    for (const blk of allOverlappingBlocks || []) {
      const k = String(blk.gearId);
      const arr = blocksByGearId.get(k) || [];
      arr.push(blk);
      blocksByGearId.set(k, arr);
    }

    const bookingsByGearId = new Map<string, any[]>();
    const bookingStatusesById = new Map<string, BookingStatus>();
    for (const bk of allActiveBookings || []) {
      const k = String(bk.gearId);
      const arr = bookingsByGearId.get(k) || [];
      arr.push(bk);
      bookingsByGearId.set(k, arr);
      bookingStatusesById.set(String(bk._id), bk.status);
    }

    const extraBookedIds: string[] = Array.from(
      new Set(
        (allOverlappingBlocks || [])
          .filter(
            (b: any) =>
              b.reason === 'BOOKED' &&
              b.bookingId &&
              !bookingStatusesById.has(String(b.bookingId)),
          )
          .map((b: any) => String(b.bookingId)),
      ),
    );
    if (extraBookedIds.length > 0) {
      const extraDocs = await this.bookingModel
        .find({ _id: { $in: extraBookedIds.map((id) => new Types.ObjectId(id)) } })
        .lean();
      for (const d of extraDocs) {
        bookingStatusesById.set(String(d._id), d.status);
      }
    }

    // Compute per-gear availableQuantity ONCE via 9B sweep-line peak occupancy
    const listingsByCategory = new Map<string, any[]>();
    const availableByGearId = new Map<string, number>();

    for (const gear of eligibleListings) {
      const gIdStr = String(gear._id);
      const { peakReserved } =
        this.availabilityService.computePeakOccupancyInInterval({
          reqStart: start,
          reqEnd: end,
          availabilityPeriods: blocksByGearId.get(gIdStr) || [],
          holdingBookings: bookingsByGearId.get(gIdStr) || [],
          bookingStatusesById,
        });
      const totalQty = Math.max(1, Number(gear.totalQuantity) || 1);
      availableByGearId.set(gIdStr, Math.max(0, totalQty - peakReserved));

      const catCode = String(gear.categoryCode).toUpperCase();
      const list = listingsByCategory.get(catCode) || [];
      list.push(gear);
      listingsByCategory.set(catCode, list);
    }

    // Pre-build per-item candidate evaluations and split multi-size demands
    interface ItemDemandEvaluation {
      item: ChecklistEntry;
      categoryCode: string;
      sizeDemands: Array<{
        sizeLabel: string | null;
        allowedSizes: string[] | null;
        qtyNeeded: number;
      }>;
      passingCandidates: Array<Record<string, any>>;
      totalInCategory: number;
      passedAreaCount: number;
      missingCoordinatesCount: number;
      passedAttributesCount: number;
      passedScheduleCount: number;
      passedSharingAndBudgetCount: number;
    }

    const itemEvaluations: ItemDemandEvaluation[] = [];

    for (const item of neededRentableItems) {
      const categoryCode = String(item.categoryCode).toUpperCase();
      const categoryListings = listingsByCategory.get(categoryCode) || [];
      const sizeDemands = this.parseItemSizeDemands(item);
      const requiredSizesAll = Array.from(
        new Set(
          sizeDemands.flatMap((sd) => sd.allowedSizes || []).filter(Boolean),
        ),
      );

      const reqAttrs = item.requiredAttributes || {};
      const minRequiredCapacity = Number(
        reqAttrs.minCapacityPersons ??
          reqAttrs.capacityPersons ??
          reqAttrs.capacity ??
          0,
      );
      const minRequiredVolume = Number(
        reqAttrs.minVolumeLiters ?? reqAttrs.volumeLiters ?? 0,
      );

      const totalInCategory = categoryListings.length;
      let passedAreaCount = 0;
      let missingCoordinatesCount = 0;
      let passedAttributesCount = 0;
      let passedScheduleCount = 0;
      let passedSharingAndBudgetCount = 0;

      const passingCandidates: Array<Record<string, any>> = [];

      for (const gear of categoryListings) {
        const gIdStr = String(gear._id);

        // Filter 1: Area & Geo radius (explicit rule for listings missing coordinates)
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

        if (hasGeoFilter) {
          const coords = gear.pickupLocation?.coordinates;
          const hasValidCoords =
            Array.isArray(coords) &&
            coords.length === 2 &&
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number' &&
            Number.isFinite(coords[0]) &&
            Number.isFinite(coords[1]) &&
            !(coords[0] === 0 && coords[1] === 0) &&
            Math.abs(coords[0]) <= 180 &&
            Math.abs(coords[1]) <= 90;

          if (!hasValidCoords) {
            // Missing coordinates cannot verify distance inside specified radius -> excluded explicitly
            missingCoordinatesCount++;
            areaMatched = false;
          } else {
            distanceKm = this.calculateDistanceKm(
              dto.lat!,
              dto.lng!,
              coords[1],
              coords[0],
            );
            if (distanceKm > radiusKm) {
              areaMatched = false;
            }
          }
        }

        if (!areaMatched) {
          continue;
        }
        passedAreaCount++;

        // Filter 2: Required attributes (per-size matching + capacity check)
        const gearSizes = this.extractCandidateGearSizeStrings(gear);
        let attrMatched = true;
        let attrMatchScore = 0;

        if (requiredSizesAll.length > 0) {
          const matchedAnyReqSize = gearSizes.some((gs) =>
            requiredSizesAll.includes(gs),
          );
          if (!matchedAnyReqSize) {
            attrMatched = false;
          } else {
            attrMatchScore += 10;
          }
        }

        if (attrMatched && minRequiredCapacity > 0) {
          const gearCap = Number(
            gear.attributes?.capacityPersons ??
              gear.attributes?.sleepCapacity ??
              gear.attributes?.capacity ??
              0,
          );
          if (!gearCap || gearCap < minRequiredCapacity) {
            attrMatched = false;
          } else {
            attrMatchScore += 5;
          }
        }

        if (attrMatched && minRequiredVolume > 0) {
          const gearVol = Number(
            gear.attributes?.volumeLiters ?? gear.attributes?.capacityLiters ?? 0,
          );
          if (!gearVol || gearVol < minRequiredVolume) {
            attrMatched = false;
          } else {
            attrMatchScore += 3;
          }
        }

        if (!attrMatched) {
          continue;
        }
        passedAttributesCount++;

        // Filter 3: Unified 9B rental duration limits & sweep-line peak occupancy
        const durationCheck =
          this.availabilityService.validateRentalDurationAndNotice(
            gear,
            start,
            rentalDays,
          );
        if (!durationCheck.valid) {
          continue;
        }

        const totalQuantity = Math.max(1, Number(gear.totalQuantity) || 1);
        const availableQuantity = availableByGearId.get(gIdStr) ?? 0;
        if (availableQuantity < 1) {
          continue;
        }
        passedScheduleCount++;

        // Filter 4: Sharing type & Budget cap per listing card
        const gearSharingType: GearListingType =
          gear.sharingType || gear.listingType || GearListingType.RENT;
        const unitQuote = this.availabilityService.calculateRentalQuote(
          gear,
          rentalDays,
          1,
        );
        const pricePerDay = unitQuote.pricePerDay;
        const depositPerUnit = unitQuote.depositPerUnit;
        const unitRentalFee = unitQuote.totalRentalFee;

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

        let maxAffordableUnits = availableQuantity;
        if (hasBudgetLimit && budgetVnd !== null) {
          if (budgetVnd === 0) {
            if (pricePerDay > 0 && gearSharingType !== GearListingType.FREE_LOAN) {
              continue;
            }
          } else if (unitRentalFee > 0) {
            if (unitRentalFee > budgetVnd) {
              continue;
            }
            maxAffordableUnits = Math.floor(budgetVnd / unitRentalFee);
          }
        }
        passedSharingAndBudgetCount++;

        // Respect size-specific demand cap when listing matches a single size in a multi-size request
        const matchingSizeDemandQty =
          requiredSizesAll.length > 0
            ? sizeDemands
                .filter((sd) =>
                  sd.allowedSizes?.some((as) => gearSizes.includes(as)),
                )
                .reduce((sum, sd) => sum + sd.qtyNeeded, 0)
            : item.quantityMissing;

        const fulfillableQuantity = Math.max(
          0,
          Math.min(
            item.quantityMissing,
            matchingSizeDemandQty > 0 ? matchingSizeDemandQty : item.quantityMissing,
            availableQuantity,
            maxAffordableUnits,
          ),
        );
        if (fulfillableQuantity < 1) {
          continue;
        }

        const fullQuote = this.availabilityService.calculateRentalQuote(
          gear,
          rentalDays,
          fulfillableQuantity,
        );
        const estimatedRentalTotal = fullQuote.totalRentalFee;
        const depositTotal = fullQuote.depositAmount;

        const ownerProfile = profileMap.get(String(gear.ownerId));
        const conditionScore = CONDITION_SCORE[gear.condition] || 2;
        const coverageLabel = `Đáp ứng ${fulfillableQuantity}/${item.quantityMissing}`;
        const isFullCoverage = fulfillableQuantity >= item.quantityMissing;

        const reasonParts: string[] = [
          `Còn trống ${availableQuantity}/${totalQuantity} ${item.unit} tại ${gear.district}, ${gear.city}`,
          coverageLabel,
        ];
        if (attrMatchScore > 0 && requiredSizesAll.length > 0 && gearSizes.length > 0) {
          reasonParts.push(`Khớp size ${gearSizes.map((s) => s.toUpperCase()).join('/')}`);
        }
        if (minRequiredCapacity > 0 && gear.attributes?.capacityPersons) {
          reasonParts.push(`Sức chứa ${gear.attributes.capacityPersons} người`);
        }
        if (pricePerDay === 0 || gearSharingType === GearListingType.FREE_LOAN) {
          reasonParts.push('Cho mượn miễn phí (0 ₫)');
        } else {
          reasonParts.push(
            `Phí ${fulfillableQuantity} ${item.unit}/${rentalDays} ngày: ${estimatedRentalTotal.toLocaleString('vi-VN')} ₫`,
          );
        }

        const bookingUrl = `/gear/${gIdStr}?startAt=${encodeURIComponent(
          dto.startAt,
        )}&endAt=${encodeURIComponent(dto.endAt)}&quantity=${fulfillableQuantity}&sharingType=${encodeURIComponent(
          gearSharingType,
        )}&expectedPricePerDay=${pricePerDay}&expectedDepositAmount=${depositPerUnit}`;

        passingCandidates.push({
          gearId: gIdStr,
          id: gIdStr,
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
          matchedSizes: gearSizes,
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
          isOwnGear: false,
          isDemo: Boolean(gear.isDemo),
          owner: {
            userId: String(gear.ownerId),
            username: ownerProfile?.username || 'member',
            fullName: ownerProfile?.fullName || 'Thành viên TravelShare',
            avatarUrl: ownerProfile?.avatarUrl || '',
            trustScore: ownerProfile?.trustScore ?? 4.9,
          },
          recommendationReason: reasonParts.join(' • '),
          bookingUrl,
        });
      }

      // Deterministic, stable ranking across runs
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

      itemEvaluations.push({
        item,
        categoryCode,
        sizeDemands,
        passingCandidates,
        totalInCategory,
        passedAreaCount,
        missingCoordinatesCount,
        passedAttributesCount,
        passedScheduleCount,
        passedSharingAndBudgetCount,
      });
    }

    // 5. Global Single-Allocation Solver (1 unit allocated AT MOST ONCE + shared total budget)
    const remainingUnitPool = new Map<string, number>(availableByGearId);
    let remainingGlobalBudget =
      hasBudgetLimit && budgetVnd !== null ? budgetVnd : Number.POSITIVE_INFINITY;

    const allocationPlan: Array<Record<string, any>> = [];
    const itemAllocationStats = new Map<
      string,
      {
        fulfilledTotal: number;
        costVnd: number;
        depositVnd: number;
        sizeAllocations: Array<{
          sizeLabel: string | null;
          qtyNeeded: number;
          qtyFulfilled: number;
          unmatchedReason: string | null;
        }>;
      }
    >();

    const PRIORITY_ORDER: Record<string, number> = {
      ESSENTIAL: 0,
      CONDITIONAL: 1,
      OPTIONAL: 2,
    };

    const sortedEvalIndices = itemEvaluations
      .map((_, idx) => idx)
      .sort((aIdx, bIdx) => {
        const a = itemEvaluations[aIdx];
        const b = itemEvaluations[bIdx];
        const pa = PRIORITY_ORDER[a.item.priority] ?? 1;
        const pb = PRIORITY_ORDER[b.item.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        // Fewer candidates (rarer constraints like exact size) allocate first
        return a.passingCandidates.length - b.passingCandidates.length;
      });

    for (const idx of sortedEvalIndices) {
      const ev = itemEvaluations[idx];
      let itemFulfilled = 0;
      let itemCostVnd = 0;
      let itemDepositVnd = 0;
      const sizeAllocations: Array<{
        sizeLabel: string | null;
        qtyNeeded: number;
        qtyFulfilled: number;
        unmatchedReason: string | null;
      }> = [];

      // Allocate tightest size constraints first
      const sortedSizeDemands = [...ev.sizeDemands].sort(
        (a, b) => (a.allowedSizes?.length || 99) - (b.allowedSizes?.length || 99),
      );

      for (const sd of sortedSizeDemands) {
        let need = sd.qtyNeeded;
        const eligibleForSize = ev.passingCandidates
          .filter((cand) => {
            if (!sd.allowedSizes || sd.allowedSizes.length === 0) return true;
            const gs: string[] = cand.matchedSizes || [];
            return gs.some((s) => sd.allowedSizes!.includes(s));
          })
          .sort(
            (a, b) =>
              a.pricePerDay - b.pricePerDay ||
              b.attributeMatchScore - a.attributeMatchScore ||
              String(a.gearId).localeCompare(String(b.gearId)),
          );

        for (const cand of eligibleForSize) {
          if (need <= 0) break;
          const poolLeft = remainingUnitPool.get(cand.gearId) ?? 0;
          if (poolLeft <= 0) continue;

          const maxBudgetTake =
            cand.unitRentalFee > 0 && Number.isFinite(remainingGlobalBudget)
              ? Math.floor(remainingGlobalBudget / cand.unitRentalFee)
              : need;

          const take = Math.min(need, poolLeft, maxBudgetTake);
          if (take <= 0) continue;

          remainingUnitPool.set(cand.gearId, poolLeft - take);
          const allocCost = take * cand.unitRentalFee;
          const allocDeposit = take * cand.depositPerUnit;
          if (Number.isFinite(remainingGlobalBudget)) {
            remainingGlobalBudget = Math.max(
              0,
              remainingGlobalBudget - allocCost,
            );
          }

          need -= take;
          itemFulfilled += take;
          itemCostVnd += allocCost;
          itemDepositVnd += allocDeposit;

          allocationPlan.push({
            itemId: ev.item.itemId,
            categoryCode: ev.categoryCode,
            itemName: ev.item.name,
            sizeLabel: sd.sizeLabel,
            gearId: cand.gearId,
            title: cand.title,
            quantityAllocated: take,
            unit: ev.item.unit,
            pricePerDay: cand.pricePerDay,
            rentalDays,
            totalRentalFee: allocCost,
            depositAmount: allocDeposit,
            bookingUrl: `/gear/${cand.gearId}?startAt=${encodeURIComponent(
              dto.startAt,
            )}&endAt=${encodeURIComponent(dto.endAt)}&quantity=${take}&sharingType=${encodeURIComponent(
              cand.sharingType,
            )}&expectedPricePerDay=${cand.pricePerDay}&expectedDepositAmount=${cand.depositPerUnit}`,
          });
        }

        const fulfilledForSize = sd.qtyNeeded - need;
        sizeAllocations.push({
          sizeLabel: sd.sizeLabel,
          qtyNeeded: sd.qtyNeeded,
          qtyFulfilled: fulfilledForSize,
          unmatchedReason:
            need > 0
              ? sd.sizeLabel
                ? `Thiếu ${need} ${ev.item.unit} Size ${sd.sizeLabel}`
                : `Thiếu ${need} ${ev.item.unit}`
              : null,
        });
      }

      itemAllocationStats.set(ev.item.itemId, {
        fulfilledTotal: itemFulfilled,
        costVnd: itemCostVnd,
        depositVnd: itemDepositVnd,
        sizeAllocations,
      });
    }

    // Build final `itemMatches` and `unmatchedItems` preserving deterministic order
    const itemMatches: Array<Record<string, any>> = [];
    const unmatchedItems: Array<Record<string, any>> = [];

    for (const ev of itemEvaluations) {
      const stats = itemAllocationStats.get(ev.item.itemId)!;
      const totalFulfillableAcrossCandidates = stats.fulfilledTotal;
      const isItemFullyFulfillable =
        totalFulfillableAcrossCandidates >= ev.item.quantityMissing;

      let unmatchedReason: string | null = null;
      if (!isItemFullyFulfillable) {
        const missingSizeMsgs = stats.sizeAllocations
          .filter((sa) => sa.unmatchedReason)
          .map((sa) => sa.unmatchedReason!);

        if (ev.passingCandidates.length === 0) {
          if (ev.totalInCategory === 0) {
            unmatchedReason =
              'Hiện chưa có thiết bị thuộc danh mục này đang mở cho thuê trên hệ thống.';
          } else if (ev.passedAreaCount === 0) {
            unmatchedReason =
              hasGeoFilter && ev.missingCoordinatesCount > 0
                ? `Không có thiết bị hợp lệ trong bán kính ${radiusKm} km (${ev.missingCoordinatesCount} tin bị loại do thiếu tọa độ hoặc ngoài phạm vi).`
                : `Không có thiết bị cùng loại tại khu vực nhận đồ đã chọn (${rawPickupArea || 'khu vực yêu cầu'}).`;
          } else if (ev.passedAttributesCount === 0) {
            const reqSize =
              ev.item.requiredAttributes?.size ??
              ev.item.requiredAttributes?.sizeEu ??
              ev.item.requiredAttributes?.capacityPersons ??
              JSON.stringify(ev.item.requiredAttributes);
            unmatchedReason = `Không có thiết bị đáp ứng kích cỡ/sức chứa yêu cầu (Size ${reqSize}).`;
          } else if (ev.passedScheduleCount === 0) {
            unmatchedReason =
              'Các thiết bị cùng loại tại khu vực này đã kín lịch hoặc không khớp giới hạn ngày thuê.';
          } else if (ev.passedSharingAndBudgetCount === 0) {
            if (hasBudgetLimit && budgetVnd === 0) {
              unmatchedReason =
                'Vượt ngân sách 0đ (không có thiết bị cho mượn miễn phí khả dụng trong khoảng ngày và khu vực này).';
            } else {
              unmatchedReason = `Chi phí thuê vượt quá ngân sách dự kiến (${Number(
                budgetVnd,
              ).toLocaleString('vi-VN')} ₫).`;
            }
          } else {
            unmatchedReason =
              'Không tìm thấy thiết bị phù hợp với bộ lọc hiện tại.';
          }
        } else if (missingSizeMsgs.length > 0 && ev.sizeDemands.length > 1) {
          unmatchedReason = `Chỉ đáp ứng ${totalFulfillableAcrossCandidates}/${ev.item.quantityMissing} ${ev.item.unit}: ${missingSizeMsgs.join(', ')} (các size khác không bù thay thế cho nhau).`;
        } else {
          unmatchedReason = hasBudgetLimit
            ? `Chỉ phân bổ được tối đa ${totalFulfillableAcrossCandidates}/${ev.item.quantityMissing} ${ev.item.unit} trong phần tồn trống và ngân sách còn lại.`
            : `Tổng số lượng trống trong khu vực chỉ đáp ứng ${totalFulfillableAcrossCandidates}/${ev.item.quantityMissing} ${ev.item.unit}.`;
        }

        if (ev.passingCandidates.length === 0 || !isItemFullyFulfillable) {
          unmatchedItems.push({
            itemId: ev.item.itemId,
            categoryCode: ev.categoryCode,
            name: ev.item.name,
            quantityRequired: ev.item.quantityRequired,
            quantityOwned: ev.item.quantityOwned,
            quantityMissing: ev.item.quantityMissing,
            quantityFulfilled: totalFulfillableAcrossCandidates,
            unit: ev.item.unit,
            requiredAttributes: ev.item.requiredAttributes,
            unmatchedReason,
          });
        }
      }

      const displayCandidates = dto.limitPerItem
        ? ev.passingCandidates.slice(0, dto.limitPerItem)
        : ev.passingCandidates;

      itemMatches.push({
        itemId: ev.item.itemId,
        categoryCode: ev.categoryCode,
        name: ev.item.name,
        priority: ev.item.priority,
        unit: ev.item.unit,
        quantityRequired: ev.item.quantityRequired,
        quantityNeeded: ev.item.quantityRequired,
        quantityOwned: ev.item.quantityOwned,
        quantityMissing: ev.item.quantityMissing,
        requiredAttributes: ev.item.requiredAttributes,
        sizeAllocations: stats.sizeAllocations,
        totalFulfillableQuantity: totalFulfillableAcrossCandidates,
        isFullyFulfillable: isItemFullyFulfillable,
        coverageSummaryLabel: `Đáp ứng tối đa ${totalFulfillableAcrossCandidates}/${ev.item.quantityMissing} ${ev.item.unit}`,
        minEstimatedCostForItemVnd: stats.costVnd,
        minDepositForItemVnd: stats.depositVnd,
        unmatchedReason,
        candidates: displayCandidates,
        totalCandidatesCount: ev.passingCandidates.length,
      });
    }

    // 6. Overall Budget & Fulfillment Evaluation strictly derived from concrete `allocationPlan`
    const hasUnconfirmedItems = unconfirmedOwnedItems.length > 0;
    const canFulfillAllConfirmed =
      neededRentableItems.length > 0 &&
      itemMatches.every((m) => m.isFullyFulfillable);
    const minTotalEstimatedCostVnd = allocationPlan.reduce(
      (sum, a) => sum + (Number(a.totalRentalFee) || 0),
      0,
    );
    const minTotalDepositVnd = allocationPlan.reduce(
      (sum, a) => sum + (Number(a.depositAmount) || 0),
      0,
    );

    let isWithinTotalBudget = false;
    let budgetStatusLabel = 'Chưa đặt giới hạn ngân sách';

    if (neededRentableItems.length === 0 && hasUnconfirmedItems) {
      isWithinTotalBudget = false;
      budgetStatusLabel =
        'Chưa xác nhận đủ số lượng đồ đã có để kết luận nhu cầu thuê';
    } else if (neededRentableItems.length === 0) {
      isWithinTotalBudget = true;
      budgetStatusLabel = 'Đã có đủ thiết bị, không cần thuê thêm';
    } else if (hasUnconfirmedItems) {
      isWithinTotalBudget = false;
      budgetStatusLabel = `Còn ${unconfirmedOwnedItems.length} mục chưa rõ số lượng đã có — chưa thể kết luận đủ cho toàn bộ chuyến đi`;
    } else if (hasBudgetLimit && budgetVnd !== null) {
      if (canFulfillAllConfirmed && minTotalEstimatedCostVnd <= budgetVnd) {
        isWithinTotalBudget = true;
        budgetStatusLabel = 'Đủ đồ trong ngân sách';
      } else if (budgetVnd === 0) {
        isWithinTotalBudget = false;
        budgetStatusLabel =
          'Ngân sách 0đ chỉ hỗ trợ đồ mượn miễn phí — chưa đáp ứng đủ toàn bộ nhu cầu';
      } else {
        isWithinTotalBudget = false;
        budgetStatusLabel =
          'Chưa có phương án đáp ứng đủ toàn bộ nhu cầu trong ngân sách';
      }
    } else {
      isWithinTotalBudget = canFulfillAllConfirmed;
      budgetStatusLabel = canFulfillAllConfirmed
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
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        radiusKm: hasGeoFilter ? radiusKm : null,
        budgetVnd,
        hasBudgetLimit,
        sharingType: dto.sharingType || null,
      },
      budgetSummary: {
        hasBudgetLimit,
        budgetVnd,
        minTotalEstimatedCostVnd,
        minTotalDepositVnd,
        canFulfillAllItems: canFulfillAllConfirmed && !hasUnconfirmedItems,
        isWithinTotalBudget,
        hasUnconfirmedItems,
        statusLabel: budgetStatusLabel,
      },
      allocationPlan,
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
        message: `Bạn đã đề cập có sẵn "${i.name}" trong hội thoại. Vui lòng nhập số lượng thực tế đang có để hệ thống tính phần còn thiếu.`,
      })),
    };
  }

  private parseItemSizeDemands(item: ChecklistEntry): Array<{
    sizeLabel: string | null;
    allowedSizes: string[] | null;
    qtyNeeded: number;
  }> {
    const reqAttrs = item.requiredAttributes || {};
    const totalMissing = Math.max(1, Number(item.quantityMissing) || 1);

    if (
      reqAttrs.sizeBreakdown &&
      typeof reqAttrs.sizeBreakdown === 'object' &&
      !Array.isArray(reqAttrs.sizeBreakdown)
    ) {
      const entries = Object.entries(reqAttrs.sizeBreakdown)
        .map(([k, v]) => ({
          sizeLabel: String(k).trim(),
          qty: Math.max(0, Math.floor(Number(v) || 0)),
        }))
        .filter((e) => e.sizeLabel && e.qty > 0);

      if (entries.length > 0) {
        let budget = totalMissing;
        const result: Array<{
          sizeLabel: string | null;
          allowedSizes: string[] | null;
          qtyNeeded: number;
        }> = [];
        for (const e of entries) {
          if (budget <= 0) break;
          const take = Math.min(budget, e.qty);
          result.push({
            sizeLabel: e.sizeLabel,
            allowedSizes: [e.sizeLabel.toLowerCase()],
            qtyNeeded: take,
          });
          budget -= take;
        }
        if (budget > 0) {
          result.push({
            sizeLabel: null,
            allowedSizes: null,
            qtyNeeded: budget,
          });
        }
        return result;
      }
    }

    const reqSizeRaw =
      reqAttrs.size ?? reqAttrs.sizeEu ?? reqAttrs.shoeSize ?? null;
    if (
      reqSizeRaw !== null &&
      reqSizeRaw !== undefined &&
      String(reqSizeRaw).trim() !== ''
    ) {
      const requestedSizes = String(reqSizeRaw)
        .split(/[,;/\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (requestedSizes.length >= 2 && totalMissing >= requestedSizes.length) {
        const base = Math.floor(totalMissing / requestedSizes.length);
        let rem = totalMissing % requestedSizes.length;
        return requestedSizes.map((sz) => {
          const take = base + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
          return {
            sizeLabel: sz,
            allowedSizes: [sz.toLowerCase()],
            qtyNeeded: take,
          };
        });
      }

      if (requestedSizes.length >= 2) {
        return [
          {
            sizeLabel: requestedSizes.join('/'),
            allowedSizes: requestedSizes.map((s) => s.toLowerCase()),
            qtyNeeded: totalMissing,
          },
        ];
      }

      if (requestedSizes.length === 1) {
        return [
          {
            sizeLabel: requestedSizes[0],
            allowedSizes: [requestedSizes[0].toLowerCase()],
            qtyNeeded: totalMissing,
          },
        ];
      }
    }

    return [{ sizeLabel: null, allowedSizes: null, qtyNeeded: totalMissing }];
  }

  private extractCandidateGearSizeStrings(gear: any): string[] {
    const attrs = gear?.attributes || {};
    const candidates: unknown[] = [
      attrs.sizeEu,
      attrs.size,
      attrs.shoeSize,
      ...(Array.isArray(attrs.availableSizes) ? attrs.availableSizes : []),
    ];
    const out = new Set<string>();
    for (const val of candidates) {
      if (val === null || val === undefined) continue;
      const str = String(val).trim().toLowerCase();
      if (!str) continue;
      for (const part of str.split(/[,;/\s]+/)) {
        if (part.trim()) out.add(part.trim());
      }
    }
    return Array.from(out);
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
        ? (() => {
            const norm = normalizeLegacyActivity(
              plan.activity,
              (plan as any).environment,
            );
            return {
              id: String(plan._id),
              destination: plan.destination,
              activity: norm.activity || plan.activity,
              environment: norm.environment,
              isOvernight: (plan as any).isOvernight ?? null,
              durationDays: plan.durationDays,
              travelers: plan.travelers,
              departureDate: plan.departureDate
                ? new Date(plan.departureDate).toISOString().slice(0, 10)
                : null,
              budgetVnd: plan.budgetVnd ?? null,
              pickupArea: plan.pickupArea ?? null,
              planVersion: Number(plan.planVersion) || 1,
            };
          })()
        : undefined,
      createdAt: checklist.createdAt,
      updatedAt: checklist.updatedAt,
    };
  }
}
