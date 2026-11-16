import {
  ActivityType,
  ChecklistPriority,
  normalizeLegacyActivity,
  TripEnvironment,
} from '../../common/enums/system.enums';
import { ChecklistEntry } from '../../database/schemas/ai-checklist.schema';

export type ChecklistOperationIntent =
  | 'SET_OWNED'
  | 'INCREMENT_OWNED'
  | 'DECREMENT_OWNED'
  | 'SET_MISSING'
  | 'SET_REQUIRED'
  | 'INCREMENT_REQUIRED'
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
  environments?: TripEnvironment[];
  coastalOverride?: {
    itemName?: string;
    reasonTemplate?: string;
  };
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
  SWIMWEAR: {
    categoryCode: 'SWIMWEAR',
    shortLabelVi: 'đồ bơi',
    defaultItemName: 'Đồ bơi cá nhân',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Trang phục cá nhân cần thiết cho hoạt động tắm biển và thể thao nước.',
  },
  BEACH_TOWEL: {
    categoryCode: 'BEACH_TOWEL',
    shortLabelVi: 'khăn tắm',
    defaultItemName: 'Khăn tắm nhanh khô',
    unit: 'chiếc',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Lau khô và giữ ấm ngay sau khi tắm biển (đồ cá nhân tự chuẩn bị).',
  },
  BEACH_SANDALS: {
    categoryCode: 'BEACH_SANDALS',
    shortLabelVi: 'dép đi biển',
    defaultItemName: 'Dép đi biển chống trượt',
    unit: 'đôi',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Di chuyển thoải mái trên cát nóng, sỏi và đá ven biển.',
  },
  SUN_PROTECTION: {
    categoryCode: 'SUN_PROTECTION',
    shortLabelVi: 'chống nắng & kính râm',
    defaultItemName: 'Kem chống nắng SPF50+, kính râm & mũ rộng vành',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bảo vệ da và mắt khỏi tia UV gắt ngoài trời/ven biển.',
  },
  DRY_BAG: {
    categoryCode: 'DRY_BAG',
    shortLabelVi: 'túi chống nước',
    defaultItemName: 'Túi khô / Túi chống nước bảo vệ đồ điện tử',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bảo vệ điện thoại, ví tiền và giấy tờ khỏi nước biển, mưa hoặc cát ẩm.',
  },
  WALKING_SHOES: {
    categoryCode: 'WALKING_SHOES',
    shortLabelVi: 'giày đi bộ',
    defaultItemName: 'Giày thể thao / Giày đi bộ êm chân',
    unit: 'đôi',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Di chuyển cả ngày giữa các điểm tham quan mà không đau chân.',
  },
  POWER_BANK: {
    categoryCode: 'POWER_BANK',
    shortLabelVi: 'sạc dự phòng',
    defaultItemName: 'Pin sạc dự phòng & dây cáp sạc',
    unit: 'chiếc',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Đảm bảo điện thoại luôn đủ pin tra cứu bản đồ, liên lạc và chụp ảnh.',
  },
  HELMET: {
    categoryCode: 'HELMET',
    shortLabelVi: 'mũ bảo hiểm',
    defaultItemName: 'Mũ bảo hiểm 3/4 hoặc Fullface đạt chuẩn',
    unit: 'chiếc',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'An toàn bắt buộc khi chạy xe máy đường đèo/đường dài.',
  },
  RIDING_GLOVES_ARMOR: {
    categoryCode: 'RIDING_GLOVES_ARMOR',
    shortLabelVi: 'găng tay & bảo hộ',
    defaultItemName: 'Găng tay lái xe & Bộ giáp bảo hộ tay/chân',
    unit: 'bộ',
    canRent: true,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Giảm mỏi tay lái, chống nắng gió và bảo vệ khớp khi phượt xe máy.',
  },
  BUNGEE_CORDS: {
    categoryCode: 'BUNGEE_CORDS',
    shortLabelVi: 'dây ràng đồ',
    defaultItemName: 'Dây ràng & lưới chằng hành lý yên xe',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Cố định chắc balo và hành lý trên yên xe máy suốt cung đường.',
  },
  TIRE_REPAIR_KIT: {
    categoryCode: 'TIRE_REPAIR_KIT',
    shortLabelVi: 'bộ vá xe cơ bản',
    defaultItemName: 'Bộ vá xe máy khẩn cấp & bơm mini',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    reasonTemplate: 'Xử lý nhanh sự cố thủng lốp ở những đoạn đèo vắng tiệm sửa xe.',
  },
  TRAVEL_LOCK_POUCH: {
    categoryCode: 'TRAVEL_LOCK_POUCH',
    shortLabelVi: 'túi giấy tờ & khóa nhỏ',
    defaultItemName: 'Túi đựng hộ chiếu/giấy tờ & ổ khóa số mini',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bảo mật giấy tờ tùy thân và hành lý khi lưu trú hostel/tàu xe.',
  },
  QUICK_DRY_CLOTHES: {
    categoryCode: 'QUICK_DRY_CLOTHES',
    shortLabelVi: 'đồ nhanh khô',
    defaultItemName: 'Quần áo nhanh khô & khăn du lịch nén gọn',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Tối ưu trọng lượng hành lý và dễ giặt phơi khi di chuyển nhiều chặng.',
  },
  FIRST_AID_KIT: {
    categoryCode: 'FIRST_AID_KIT',
    shortLabelVi: 'túi y tế / sơ cứu',
    defaultItemName: 'Túi y tế cá nhân & bộ sơ cứu cơ bản',
    unit: 'bộ',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    reasonTemplate: 'Xử lý kịp thời vết trầy xước, say nắng, đau bụng hoặc côn trùng đốt.',
  },
  THERMAL_LAYER: {
    categoryCode: 'THERMAL_LAYER',
    shortLabelVi: 'áo giữ nhiệt / lông vũ',
    defaultItemName: 'Áo giữ nhiệt & áo khoác lông vũ chịu lạnh',
    unit: 'chiếc',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Giữ ấm sâu ở độ cao lớn nơi nhiệt độ giảm mạnh về đêm và rạng sáng.',
  },
  CLIMBING_GLOVES: {
    categoryCode: 'CLIMBING_GLOVES',
    shortLabelVi: 'găng tay leo núi',
    defaultItemName: 'Găng tay bám đá & chống rét leo núi',
    unit: 'đôi',
    canRent: false,
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    reasonTemplate: 'Bảo vệ lòng bàn tay khi bám vách đá/dây an toàn và chống cóng tay.',
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
  // CAMPING RULES (hỗ trợ cả bối cảnh rừng/hồ lẫn ven biển `environment: COASTAL`)
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TENT',
    itemName: 'Lều cắm trại chống mưa PU3000mm+',
    coastalOverride: {
      itemName: 'Lều cắm trại ven biển chống gió & cọc neo cát',
      reasonTemplate:
        'Lều 2 lớp thoáng khí có cọc neo cát/dây chằng chống gió biển khi ngủ qua đêm.',
    },
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
    coastalOverride: {
      itemName: 'Túi ngủ mỏng thoáng khí & tấm lót cách ẩm bãi biển',
      reasonTemplate:
        'Cách ẩm nền cát và giữ ấm nhẹ trước gió biển ban đêm khi cắm trại qua đêm.',
    },
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
    reasonTemplate: 'Tăng trải nghiệm nghỉ ngơi thoải mái bên hồ/bãi cỏ/bãi biển.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn lồng treo lều / Đèn đội đầu cắm trại',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Chiếu sáng lều trại và khu vực sinh hoạt chung vào buổi tối.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'TARP',
    itemName: 'Tấm bạt / Tăng che nắng gió bãi biển',
    unit: 'tấm',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    environments: ['COASTAL'],
    reasonTemplate: 'Che nắng gắt ban ngày và chắn gió biển cho khu vực sinh hoạt chung.',
  },
  {
    activity: ActivityType.CAMPING,
    categoryCode: 'SUN_PROTECTION',
    itemName: 'Kem chống nắng, kính râm & xịt chống côn trùng biển',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    environments: ['COASTAL'],
    reasonTemplate: 'Bảo vệ da khỏi nắng biển và muối mặn khi sinh hoạt ngoài trời.',
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
  // BEACH RULES (đi biển ban ngày - không tự thêm lều/túi ngủ trừ khi user yêu cầu riêng)
  {
    activity: ActivityType.BEACH,
    categoryCode: 'SWIMWEAR',
    itemName: 'Đồ bơi cá nhân',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Trang phục cần thiết cho hoạt động tắm biển và vui chơi dưới nước.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'BEACH_TOWEL',
    itemName: 'Khăn tắm nhanh khô',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Lau khô và giữ ấm ngay sau khi lên bờ.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'BEACH_SANDALS',
    itemName: 'Dép đi biển chống trượt',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Di chuyển thoải mái trên cát nóng và khu vực bãi đá ẩm ven biển.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'SUN_PROTECTION',
    itemName: 'Kem chống nắng SPF50+, kính râm & mũ rộng vành',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Bảo vệ da và mắt khỏi nắng biển gay gắt.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'DRY_BAG',
    itemName: 'Túi khô chống nước đi biển',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Giữ điện thoại, ví và đồ cá nhân khô ráo khi ra bãi biển/lên tàu.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'CAMERA',
    itemName: 'Action Cam / Máy ảnh chống nước',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    reasonTemplate: 'Ghi lại khoảnh khắc đi biển, chèo kayak hoặc lặn ngắm san hô.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'CAMPING_CHAIR',
    itemName: 'Ghế xếp thư giãn bãi biển',
    unit: 'chiếc',
    priority: ChecklistPriority.OPTIONAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Ngồi nghỉ ngơi thoải mái trên bãi cát khi đi biển theo nhóm.',
  },
  {
    activity: ActivityType.BEACH,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống & Điện giải bù khoáng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Bù nước liên tục dưới nắng biển (tự chuẩn bị, không cho thuê).',
  },
  // SIGHTSEEING RULES (tham quan, city/spot tour gọn nhẹ)
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'BACKPACK',
    itemName: 'Balo du lịch gọn nhẹ (15L - 25L)',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Đựng nước uống, áo khoác nhẹ và vật dụng cá nhân khi tham quan cả ngày.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'WALKING_SHOES',
    itemName: 'Giày đi bộ / Giày thể thao êm chân',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Di chuyển nhiều giữa các điểm tham quan mà không đau mỏi chân.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'CAMERA',
    itemName: 'Máy ảnh du lịch / Action Cam',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    reasonTemplate: 'Lưu giữ kỷ niệm tại các điểm check-in của chuyến đi.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'POWER_BANK',
    itemName: 'Pin sạc dự phòng & dây cáp',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Giữ pin điện thoại để tra bản đồ, vé điện tử và chụp ảnh suốt ngày.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'SUN_PROTECTION',
    itemName: 'Kem chống nắng, mũ & kính râm',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chống nắng khi tham quan ngoài trời.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác nhẹ / Ô gấp gọn che nắng mưa',
    unit: 'bộ',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chủ động ứng phó mưa bất chợt hoặc gió lạnh.',
  },
  {
    activity: ActivityType.SIGHTSEEING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống cá nhân hàng ngày',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Bổ sung nước khi đi bộ tham quan ngoài trời.',
  },
  // MOTORBIKE_TOUR RULES (phượt xe máy)
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'HELMET',
    itemName: 'Mũ bảo hiểm 3/4 hoặc Fullface đạt chuẩn',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Bảo vệ an toàn đầu khi di chuyển đường dài và đường đèo.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'RIDING_GLOVES_ARMOR',
    itemName: 'Găng tay lái xe & Bộ bảo hộ tay/chân',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Tăng độ bám tay ga, chống gió lạnh và giảm chấn thương.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo mưa bộ đi phượt chống rách',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Áo mưa bộ gọn người không vướng víu tay lái khi chạy xe trời mưa.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'BUNGEE_CORDS',
    itemName: 'Dây ràng & lưới chằng hành lý',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chằng chặt balo/túi đồ lên yên sau khi đổ đèo.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'DRY_BAG',
    itemName: 'Túi chống nước buộc xe máy',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Giữ quần áo và đồ điện tử khô ráo khi gặp mưa đường dài.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'TIRE_REPAIR_KIT',
    itemName: 'Bộ vá xe cơ bản & bơm mini',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: false,
    reasonTemplate: 'Xử lý sự cố xịt lốp trên những cung đường vắng.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn pin / Đèn đội đầu dự phòng ban đêm',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    reasonTemplate: 'Hỗ trợ kiểm tra xe hoặc sửa chữa khi trời tối.',
  },
  {
    activity: ActivityType.MOTORBIKE_TOUR,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống & Điện giải đi đường dài',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Giữ tỉnh táo và bù nước suốt chặng chạy xe.',
  },
  // BACKPACKING RULES (du lịch bụi tự túc đa chặng)
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'BACKPACK',
    itemName: 'Balo du lịch chính (35L - 50L)',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Chứa gọn đồ cá nhân nhiều ngày khi di chuyển liên tục bằng xe khách/tàu.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'TRAVEL_LOCK_POUCH',
    itemName: 'Túi giấy tờ, tiền mặt & ổ khóa nhỏ',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Bảo vệ CCCD/hộ chiếu và khóa locker khi ở phòng tập thể.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'QUICK_DRY_CLOTHES',
    itemName: 'Quần áo nhanh khô & khăn du lịch nén',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Tiết kiệm diện tích balo và dễ khô qua đêm.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'POWER_BANK',
    itemName: 'Pin sạc dự phòng & bộ đổi nguồn',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Duy trì kết nối liên lạc và bản đồ trên các chặng di chuyển dài.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'WALKING_SHOES',
    itemName: 'Giày đi bộ bền nhẹ',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Di chuyển linh hoạt nhiều địa hình đô thị lẫn đường đất.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác gió chống mưa nhẹ',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chống mưa rào và giữ ấm trên xe/tàu ban đêm.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'FIRST_AID_KIT',
    itemName: 'Thuốc cá nhân & bộ y tế cơ bản',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: false,
    reasonTemplate: 'Phòng cảm cúm, tiêu hóa, say xe và vết xước nhẹ.',
  },
  {
    activity: ActivityType.BACKPACKING,
    categoryCode: 'CAMERA',
    itemName: 'Máy ảnh gọn nhẹ / Action Cam',
    unit: 'chiếc',
    priority: ChecklistPriority.OPTIONAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: true,
    reasonTemplate: 'Ghi lại trải nghiệm khám phá từng vùng đất.',
  },
  // MOUNTAINEERING RULES (leo núi kỹ thuật / đỉnh cao)
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'BACKPACK',
    itemName: 'Balo leo núi kỹ thuật chịu lực (35L - 60L)',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Phân tải chắc chắn khi mang đồ giữ nhiệt và thiết bị leo núi dài ngày.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'TREKKING_SHOES',
    itemName: 'Giày leo núi cổ cao đế bám kỹ thuật',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Chống lật cổ chân và bám chắc trên dốc đá cao, bùn lạnh.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'TREKKING_POLES',
    itemName: 'Gậy leo núi hợp kim khóa chốt chắc',
    unit: 'cặp',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Giữ thăng bằng và giảm tải khớp gối khi leo dốc gắt.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'HEADLAMP',
    itemName: 'Đèn đội đầu công suất cao chống nước IPX6+',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Bắt buộc khi xuất phát săn mây/lên đỉnh từ rạng sáng.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'THERMAL_LAYER',
    itemName: 'Áo giữ nhiệt & áo khoác lông vũ đỉnh cao',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Giữ thân nhiệt ở khu vực đỉnh núi có gió lạnh và độ ẩm cao.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác chống gió mưa Hardshell',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chắn gió rét vùng cao và sương mù ẩm ướt.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'CLIMBING_GLOVES',
    itemName: 'Găng tay bám đá & giữ ấm',
    unit: 'đôi',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Bảo vệ tay khi bám dây, mỏm đá và giữ ấm khi nhiệt độ xuống thấp.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'TENT',
    itemName: 'Lều chịu gió đỉnh núi 2 lớp',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'SHARED_2_3',
    canRent: true,
    overnightOnly: true,
    reasonTemplate: 'Trú ẩn qua đêm trước gió núi mạnh và sương giá.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'SLEEPING_BAG',
    itemName: 'Túi ngủ giữ nhiệt chuyên sâu vùng cao',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    overnightOnly: true,
    reasonTemplate: 'Ngăn hạ thân nhiệt khi ngủ qua đêm trên núi cao.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'FIRST_AID_KIT',
    itemName: 'Bộ y tế chuyên sâu & chăn giữ nhiệt khẩn cấp',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: false,
    reasonTemplate: 'Ứng phó khẩn cấp chấn thương, hạ thân nhiệt hoặc tụt huyết áp.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống & Điện giải chuyên dụng',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Bù khoáng và tránh chuột rút khi leo độ cao lớn.',
  },
  {
    activity: ActivityType.MOUNTAINEERING,
    categoryCode: 'TRAIL_FOOD',
    itemName: 'Thanh năng lượng cao & gel dinh dưỡng',
    unit: 'suất',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY',
    canRent: false,
    reasonTemplate: 'Nạp năng lượng nhanh ở địa hình dốc và lạnh.',
  },
  // OTHER RULES (bộ khung gọn nhẹ, trung tính - không gán nhầm đồ trekking/leo núi)
  {
    activity: ActivityType.OTHER,
    categoryCode: 'BACKPACK',
    itemName: 'Balo cá nhân đựng vật dụng cần thiết',
    unit: 'chiếc',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: true,
    reasonTemplate: 'Mang gọn đồ dùng cá nhân phù hợp cho hoạt động ngoài trời.',
  },
  {
    activity: ActivityType.OTHER,
    categoryCode: 'FIRST_AID_KIT',
    itemName: 'Túi y tế & sơ cứu cơ bản',
    unit: 'bộ',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'ONE_PER_GROUP',
    canRent: false,
    reasonTemplate: 'Dự phòng y tế cơ bản cho mọi hoạt động nhóm.',
  },
  {
    activity: ActivityType.OTHER,
    categoryCode: 'POWER_BANK',
    itemName: 'Pin sạc dự phòng & liên lạc',
    unit: 'chiếc',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Giữ liên lạc thông suốt trong suốt chuyến đi.',
  },
  {
    activity: ActivityType.OTHER,
    categoryCode: 'RAIN_JACKET',
    itemName: 'Áo khoác nhẹ / Áo mưa dự phòng',
    unit: 'bộ',
    priority: ChecklistPriority.CONDITIONAL,
    scalingRule: 'PER_PERSON',
    canRent: false,
    reasonTemplate: 'Chủ động ứng phó thay đổi thời tiết đột ngột.',
  },
  {
    activity: ActivityType.OTHER,
    categoryCode: 'WATER_ELECTROLYTE',
    itemName: 'Nước uống cá nhân',
    unit: 'lít',
    priority: ChecklistPriority.ESSENTIAL,
    scalingRule: 'PER_PERSON_DAY_2L',
    canRent: false,
    reasonTemplate: 'Đảm bảo đủ nước uống hàng ngày (tự chuẩn bị).',
  },
];

const NON_RENTABLE_PERSONAL_CODES = new Set([
  'WATER_ELECTROLYTE',
  'TRAIL_FOOD',
  'SWIMWEAR',
  'BEACH_TOWEL',
  'BEACH_SANDALS',
  'SUN_PROTECTION',
  'QUICK_DRY_CLOTHES',
  'TRAVEL_LOCK_POUCH',
  'BUNGEE_CORDS',
  'TIRE_REPAIR_KIT',
  'FIRST_AID_KIT',
  'THERMAL_LAYER',
  'CLIMBING_GLOVES',
  'WALKING_SHOES',
  'POWER_BANK',
  'RAIN_JACKET',
]);

export function getBuiltinTemplatesForActivity(
  rawActivity: ActivityType | string | null | undefined,
  rawEnvironment?: TripEnvironment | string | null,
): ChecklistRuleTemplate[] {
  const norm = normalizeLegacyActivity(rawActivity, rawEnvironment);
  const effectiveActivity = norm.activity || ActivityType.OTHER;
  const effectiveEnv = norm.environment;
  return BUILTIN_CHECKLIST_RULES.filter((t) => {
    if (t.activity !== effectiveActivity) return false;
    if (t.environments && t.environments.length > 0) {
      return Boolean(effectiveEnv && t.environments.includes(effectiveEnv));
    }
    return true;
  });
}

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
  const canRent = NON_RENTABLE_PERSONAL_CODES.has(code)
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
  activity: ActivityType | string;
  environment?: TripEnvironment | string | null;
  isOvernight?: boolean | null;
  durationDays: number;
  travelers: number;
  ownedGearCodes?: string[];
  ownedGearQuantities?: Record<string, number>;
  requiredGearQuantities?: Record<string, number>;
  customGearItems?: Array<{
    categoryCode: string;
    itemName: string;
    quantityRequired: number;
    unit?: string;
  }>;
  dbRules?: any[];
  previousItems?: ChecklistEntry[];
  removedItemCodes?: string[];
  didTravelersOrDurationChange?: boolean;
  didTravelersChange?: boolean;
}): ChecklistEntry[] {
  const normalizedActivity = normalizeLegacyActivity(
    params.activity,
    params.environment,
  );
  const effectiveActivity = normalizedActivity.activity || ActivityType.OTHER;
  const effectiveEnv = normalizedActivity.environment;

  const travelers = Math.max(1, Math.floor(Number(params.travelers) || 1));
  const durationDays = Math.max(1, Math.floor(Number(params.durationDays) || 1));
  const isOvernightTrip =
    params.isOvernight === true ||
    (params.isOvernight !== false && durationDays >= 2);
  const ownedSet = new Set(
    (params.ownedGearCodes || []).map((c) => String(c).toUpperCase()),
  );
  const explicitQuantities = params.ownedGearQuantities || {};
  const explicitRequiredQuantities = params.requiredGearQuantities || {};
  const scaleDimensionChanged =
    params.didTravelersChange ?? params.didTravelersOrDurationChange ?? false;
  const removedSet = new Set(
    (params.removedItemCodes || []).map((c) => String(c).toUpperCase()),
  );

  const dbRuleMap = new Map<string, any>();
  for (const r of params.dbRules || []) {
    dbRuleMap.set(String(r.categoryCode).toUpperCase(), r);
  }

  const baseTemplates = getBuiltinTemplatesForActivity(
    effectiveActivity,
    effectiveEnv,
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

    // Skip overnight-only gear on daytime-only trips unless user manually added/edited it
    if (
      tpl.overnightOnly &&
      !isOvernightTrip &&
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

    const isDurationRule =
      scalingRule === 'PER_PERSON_DAY_2L' || scalingRule === 'PER_PERSON_DAY';
    const shouldRecomputeFromScale = isDurationRule
      ? Boolean(params.didTravelersOrDurationChange)
      : Boolean(scaleDimensionChanged);

    // Preserve userEditedRequired if trip scale affecting this item did not change, or apply pending required override before first creation
    const pendingExplicitRequired = explicitRequiredQuantities[code];
    const hasPendingRequired =
      typeof pendingExplicitRequired === 'number' &&
      Number.isInteger(pendingExplicitRequired) &&
      pendingExplicitRequired >= 1;

    const quantityRequired =
      prevItem?.userEditedRequired && !shouldRecomputeFromScale
        ? prevItem.quantityRequired
        : !prevItem && hasPendingRequired
          ? pendingExplicitRequired
          : ruleQuantityRequired;

    const isManualRequired =
      (prevItem?.userEditedRequired && !shouldRecomputeFromScale) ||
      (!prevItem && hasPendingRequired);

    const canRent = NON_RENTABLE_PERSONAL_CODES.has(code)
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

    const useCoastalCopy = effectiveEnv === 'COASTAL' && tpl.coastalOverride;
    entries.push(
      normalizeChecklistEntry({
        itemId,
        categoryCode: code,
        name:
          (useCoastalCopy ? tpl.coastalOverride?.itemName : undefined) ||
          dbOverride?.itemName ||
          tpl.itemName,
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
        userEditedRequired: Boolean(isManualRequired),
        isCustomItem: false,
        reason:
          (useCoastalCopy ? tpl.coastalOverride?.reasonTemplate : undefined) ||
          dbOverride?.reasonTemplate ||
          tpl.reasonTemplate,
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

  // Apply pre-checklist pending custom items or explicit required/owned quantities for items outside baseTemplates
  for (const custom of params.customGearItems || []) {
    const cCode = String(custom.categoryCode || '').toUpperCase();
    if (!cCode || includedCodes.has(cCode) || removedSet.has(cCode)) continue;
    const reqQty = Math.max(1, Math.floor(Number(custom.quantityRequired) || 1));
    const ownedQty = Math.max(
      0,
      Math.floor(Number(explicitQuantities[cCode]) || 0),
    );
    const meta = GEAR_CATALOG_METADATA[cCode];
    entries.push(
      normalizeChecklistEntry({
        itemId: `item_${cCode}`,
        categoryCode: cCode,
        name: meta?.defaultItemName || custom.itemName || cCode,
        quantityRequired: reqQty,
        quantityNeeded: reqQty,
        quantityOwned: ownedQty,
        quantityMissing: Math.max(0, reqQty - ownedQty),
        unit: custom.unit || meta?.unit || 'chiếc',
        priority: meta?.priority || ChecklistPriority.CONDITIONAL,
        canRent: meta?.canRent ?? true,
        isRentable: meta?.canRent ?? true,
        ownedConfirmed: true,
        userEditedOwned: ownedQty > 0,
        userEditedRequired: true,
        isCustomItem: true,
        reason:
          meta?.reasonTemplate ||
          'Hạng mục được bổ sung trước theo yêu cầu của nhóm.',
      }),
    );
    includedCodes.add(cCode);
  }

  for (const [rawCode, rawReq] of Object.entries(explicitRequiredQuantities)) {
    const cCode = String(rawCode || '').toUpperCase();
    const reqQty = Math.floor(Number(rawReq) || 0);
    if (!cCode || reqQty < 1 || includedCodes.has(cCode) || removedSet.has(cCode)) {
      continue;
    }
    const ownedQty = Math.max(
      0,
      Math.floor(Number(explicitQuantities[cCode]) || 0),
    );
    const meta = GEAR_CATALOG_METADATA[cCode];
    entries.push(
      normalizeChecklistEntry({
        itemId: `item_${cCode}`,
        categoryCode: cCode,
        name: meta?.defaultItemName || cCode,
        quantityRequired: reqQty,
        quantityNeeded: reqQty,
        quantityOwned: ownedQty,
        quantityMissing: Math.max(0, reqQty - ownedQty),
        unit: meta?.unit || 'chiếc',
        priority: meta?.priority || ChecklistPriority.CONDITIONAL,
        canRent: meta?.canRent ?? true,
        isRentable: meta?.canRent ?? true,
        ownedConfirmed: true,
        userEditedOwned: ownedQty > 0,
        userEditedRequired: true,
        isCustomItem: true,
      }),
    );
    includedCodes.add(cCode);
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

    if (op.intent === 'INCREMENT_REQUIRED') {
      const qtyToAdd = Math.max(1, Math.floor(Number(op.quantity) || 1));
      removedSet.delete(code);
      removedSet.delete(`item_${code}`);

      const idx = findItemIndex(op);
      if (idx !== -1) {
        const current = items[idx];
        const nextReq = current.quantityRequired + qtyToAdd;
        const updated = normalizeChecklistEntry({
          ...current,
          quantityRequired: nextReq,
          quantityNeeded: nextReq,
          userEditedRequired: true,
        });
        items[idx] = updated;
        didMutate = true;
        appliedSummaries.push(
          `Đã tăng thêm **${qtyToAdd} ${updated.unit}** vào **${updated.name}**: cần chuẩn bị **${updated.quantityRequired}** ${updated.unit}, đã có **${updated.quantityOwned}**, còn thiếu **${updated.quantityMissing}**.`,
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
