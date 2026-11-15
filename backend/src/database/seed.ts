import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  UserSchema,
  ProfileSchema,
  GearCategorySchema,
  GearItemSchema,
  GearAvailabilitySchema,
  BookingSchema,
  HandoverSchema,
  ReviewSchema,
  GearRuleSchema,
  CommunitySchema,
  CommunityMemberSchema,
  PostSchema,
  CommentSchema,
  ConversationSchema,
  MessageSchema,
  NotificationSchema,
} from './schemas';
import {
  AccountStatus,
  ActivityType,
  BookingStatus,
  ChecklistPriority,
  CommunityRole,
  ExperienceLevel,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  HandoverType,
  NotificationType,
  UserRole,
} from '../common/enums/system.enums';

const CATEGORIES = [
  {
    code: 'TENT',
    name: 'Lều trại',
    slug: 'leu-trai',
    icon: 'Tent',
    iconName: 'Tent',
    sortOrder: 1,
    isActive: true,
    description: 'Lều cắm trại 1-6 người, tăng bạt chống mưa dã ngoại',
    attributesSchema: [
      { key: 'capacityPersons', label: 'Sức chứa (số người)', type: 'number', required: true },
      { key: 'waterproofMm', label: 'Chỉ số chống nước (mm)', type: 'number', required: false },
      { key: 'weightKg', label: 'Trọng lượng (kg)', type: 'number', required: false },
    ],
  },
  {
    code: 'BACKPACK',
    name: 'Balo',
    slug: 'balo',
    icon: 'Backpack',
    iconName: 'Backpack',
    sortOrder: 2,
    isActive: true,
    description: 'Balo trekking trợ lực khung nhôm 30L - 70L',
    attributesSchema: [
      { key: 'capacityLiters', label: 'Dung tích (Lít)', type: 'number', required: true },
      { key: 'hasRainCover', label: 'Kèm áo mưa balo', type: 'boolean', required: false },
    ],
  },
  {
    code: 'SLEEPING_BAG',
    name: 'Túi ngủ',
    slug: 'tui-ngu',
    icon: 'Moon',
    iconName: 'Moon',
    sortOrder: 3,
    isActive: true,
    description: 'Túi ngủ lông vũ, túi ngủ giữ nhiệt, đệm hơi dã ngoại',
    attributesSchema: [
      { key: 'comfortTempC', label: 'Nhiệt độ thoải mái (°C)', type: 'number', required: true },
      { key: 'weightKg', label: 'Trọng lượng (kg)', type: 'number', required: false },
    ],
  },
  {
    code: 'TREKKING_SHOES',
    name: 'Giày trekking',
    slug: 'giay-trekking',
    icon: 'Footprints',
    iconName: 'Footprints',
    sortOrder: 4,
    isActive: true,
    description: 'Giày leo núi cổ cao/cổ thấp chống trượt, chống nước',
    attributesSchema: [
      { key: 'sizeEu', label: 'Size giày (EU)', type: 'number', required: true },
      { key: 'waterproof', label: 'Chống nước Gore-Tex', type: 'boolean', required: false },
    ],
  },
  {
    code: 'TREKKING_POLES',
    name: 'Gậy trekking',
    slug: 'gay-trekking',
    icon: 'Compass',
    iconName: 'Compass',
    sortOrder: 5,
    isActive: true,
    description: 'Gậy leo núi carbon hoặc hợp kim nhôm giảm chấn',
    attributesSchema: [
      { key: 'material', label: 'Chất liệu (Carbon/Nhôm)', type: 'text', required: true },
      { key: 'maxLengthCm', label: 'Chiều dài tối đa (cm)', type: 'number', required: false },
    ],
  },
  {
    code: 'RAIN_JACKET',
    name: 'Áo mưa',
    slug: 'ao-mua',
    icon: 'CloudRain',
    iconName: 'CloudRain',
    sortOrder: 6,
    isActive: true,
    description: 'Áo khoác chống nước Gore-Tex, bộ quần áo mưa đi rừng',
    attributesSchema: [
      { key: 'size', label: 'Kích cỡ (S/M/L/XL)', type: 'text', required: true },
    ],
  },
  {
    code: 'HEADLAMP',
    name: 'Đèn đội đầu',
    slug: 'den-doi-dau',
    icon: 'Flashlight',
    iconName: 'Flashlight',
    sortOrder: 7,
    isActive: true,
    description: 'Đèn pin đội đầu leo núi đêm, đèn treo lều cắm trại',
    attributesSchema: [
      { key: 'lumens', label: 'Độ sáng (Lumens)', type: 'number', required: true },
      { key: 'batteryHours', label: 'Thời lượng pin (giờ)', type: 'number', required: false },
    ],
  },
  {
    code: 'CAMPING_STOVE',
    name: 'Bếp dã ngoại',
    slug: 'bep-da-ngoai',
    icon: 'Flame',
    iconName: 'Flame',
    sortOrder: 8,
    isActive: true,
    description: 'Bếp gas xếp gọn, bếp cồn, bộ nồi dã ngoại hợp kim nhôm',
    attributesSchema: [
      { key: 'fuelType', label: 'Loại nhiên liệu (Bình gas lùn/dài)', type: 'text', required: true },
    ],
  },
  {
    code: 'CAMPING_CHAIR',
    name: 'Ghế camping',
    slug: 'ghe-camping',
    icon: 'Armchair',
    iconName: 'Armchair',
    sortOrder: 9,
    isActive: true,
    description: 'Ghế xếp gọn Kermit, bàn dã ngoại gấp gọn, võng cắm trại',
    attributesSchema: [
      { key: 'maxLoadKg', label: 'Tải trọng tối đa (kg)', type: 'number', required: false },
    ],
  },
  {
    code: 'CAMERA',
    name: 'Máy ảnh',
    slug: 'may-anh',
    icon: 'Camera',
    iconName: 'Camera',
    sortOrder: 10,
    isActive: true,
    description: 'Action cam GoPro, Insta360, máy ảnh du lịch, chân máy tripod',
    attributesSchema: [
      { key: 'resolution', label: 'Độ phân giải (4K/5.3K)', type: 'text', required: false },
    ],
  },
  {
    code: 'OTHER',
    name: 'Khác',
    slug: 'khac',
    icon: 'Package',
    iconName: 'Package',
    sortOrder: 11,
    isActive: true,
    description: 'Phụ kiện sinh tồn, túi khô, lọc nước cá nhân, bộ đàm nhóm',
    attributesSchema: [],
  },
];

const GEAR_RULES = [
  { activity: ActivityType.TREKKING, categoryCode: 'BACKPACK', itemName: 'Balo trekking trợ lực', priority: ChecklistPriority.ESSENTIAL, scalingRule: 'PER_PERSON', isRentable: true, reasonTemplate: 'Bắt buộc để mang nước, đồ ăn và áo giữ nhiệt suốt hành trình trekking.' },
  { activity: ActivityType.TREKKING, categoryCode: 'TREKKING_POLES', itemName: 'Gậy trekking leo núi', priority: ChecklistPriority.ESSENTIAL, scalingRule: 'PER_PERSON', isRentable: true, reasonTemplate: 'Giảm 25-30% áp lực lên khớp gối khi lên/xuống dốc đá hoặc bậc thang.' },
  { activity: ActivityType.TREKKING, categoryCode: 'TREKKING_SHOES', itemName: 'Giày trekking bám địa hình', priority: ChecklistPriority.ESSENTIAL, scalingRule: 'PER_PERSON', isRentable: true, reasonTemplate: 'Chống trơn trượt và bảo vệ cổ chân trên đường rừng.' },
  { activity: ActivityType.TREKKING, categoryCode: 'HEADLAMP', itemName: 'Đèn đội đầu chiếu sáng', priority: ChecklistPriority.CONDITIONAL, scalingRule: 'PER_PERSON', isRentable: true, reasonTemplate: 'Cần thiết khi xuất phát sớm hoặc xuống núi muộn lúc trời sẩm tối.' },
  { activity: ActivityType.CAMPING, categoryCode: 'TENT', itemName: 'Lều cắm trại chống mưa', priority: ChecklistPriority.ESSENTIAL, scalingRule: 'SHARED_2_3', isRentable: true, reasonTemplate: 'Nơi nghỉ ngơi qua đêm, chắn gió và sương lạnh.' },
  { activity: ActivityType.CAMPING, categoryCode: 'SLEEPING_BAG', itemName: 'Túi ngủ giữ nhiệt', priority: ChecklistPriority.ESSENTIAL, scalingRule: 'PER_PERSON', isRentable: true, reasonTemplate: 'Giữ ấm cơ thể khi nhiệt độ ban đêm hạ thấp.' },
  { activity: ActivityType.CAMPING, categoryCode: 'CAMPING_STOVE', itemName: 'Bếp dã ngoại & bộ nồi', priority: ChecklistPriority.CONDITIONAL, scalingRule: 'ONE_PER_GROUP', isRentable: true, reasonTemplate: 'Nấu ăn và đun nước nóng cho cả nhóm tại bãi trại.' },
];

async function runSeed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/travelshare';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for seeding...');

  const UserModel = mongoose.model('User', UserSchema);
  const ProfileModel = mongoose.model('Profile', ProfileSchema);
  const CategoryModel = mongoose.model('GearCategory', GearCategorySchema);
  const GearItemModel = mongoose.model('GearItem', GearItemSchema);
  const AvailabilityModel = mongoose.model('GearAvailability', GearAvailabilitySchema);
  const BookingModel = mongoose.model('Booking', BookingSchema);
  const HandoverModel = mongoose.model('Handover', HandoverSchema);
  const ReviewModel = mongoose.model('Review', ReviewSchema);
  const GearRuleModel = mongoose.model('GearRule', GearRuleSchema);
  const CommunityModel = mongoose.model('Community', CommunitySchema);
  const CommunityMemberModel = mongoose.model('CommunityMember', CommunityMemberSchema);
  const PostModel = mongoose.model('Post', PostSchema);
  const CommentModel = mongoose.model('Comment', CommentSchema);
  const ConversationModel = mongoose.model('Conversation', ConversationSchema);
  const MessageModel = mongoose.model('Message', MessageSchema);
  const NotificationModel = mongoose.model('Notification', NotificationSchema);

  const categoryMap: Record<string, any> = {};
  for (const cat of CATEGORIES) {
    const doc = await CategoryModel.findOneAndUpdate(
      { code: cat.code },
      { $set: cat },
      { upsert: true, new: true },
    );
    categoryMap[cat.code] = doc;
  }
  console.log(`Seeded ${CATEGORIES.length} gear categories.`);

  for (const rule of GEAR_RULES) {
    await GearRuleModel.updateOne(
      { activity: rule.activity, categoryCode: rule.categoryCode },
      { $set: rule },
      { upsert: true },
    );
  }

  const passwordHash = await bcrypt.hash('TravelShare@123', 10);

  const demoAccounts = [
    {
      email: 'admin@travelshare.vn',
      role: UserRole.ADMIN,
      username: 'travelshare_admin',
      fullName: 'Quản trị viên TravelShare (DEMO)',
      bio: 'Tài khoản quản trị hệ thống TravelShare.',
      city: 'Hà Nội, Việt Nam',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      experienceLevel: ExperienceLevel.ADVANCED,
      favoriteActivities: ['TREKKING', 'CAMPING'],
    },
    {
      email: 'quan.trekking@travelshare.vn',
      role: UserRole.USER,
      username: 'quan_trekking',
      fullName: 'Trần Minh Quân',
      bio: 'Đã chinh phục 12/15 đỉnh núi cao nhất Việt Nam. Luôn sẵn sàng cho mượn gậy trekking & đèn đội đầu tại Hà Nội.',
      city: 'Cầu Giấy, Hà Nội',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      experienceLevel: ExperienceLevel.ADVANCED,
      favoriteActivities: ['TREKKING', 'MOUNTAINEERING'],
    },
    {
      email: 'vy.camping@travelshare.vn',
      role: UserRole.USER,
      username: 'vy_camping',
      fullName: 'Nguyễn Thảo Vy',
      bio: 'Mê cắm trại săn bình minh bên hồ và nấu ăn dã ngoại cuối tuần.',
      city: 'Đống Đa, Hà Nội',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      favoriteActivities: ['CAMPING', 'BACKPACKING'],
    },
  ];

  const createdUsers: Record<string, any> = {};
  for (const acc of demoAccounts) {
    let user = await UserModel.findOne({ email: acc.email });
    if (!user) {
      user = await UserModel.create({
        email: acc.email,
        passwordHash,
        role: acc.role,
        status: AccountStatus.ACTIVE,
        emailVerified: true,
      });
    }
    await ProfileModel.updateOne(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          username: acc.username,
          fullName: acc.fullName,
          bio: acc.bio,
          city: acc.city,
          avatarUrl: acc.avatarUrl,
          experienceLevel: acc.experienceLevel,
          favoriteActivities: acc.favoriteActivities,
          trustScore: 4.9,
        },
      },
      { upsert: true },
    );
    createdUsers[acc.username] = user;
  }

  const adminUser = createdUsers['travelshare_admin'];
  const quanUser = createdUsers['quan_trekking'];
  const vyUser = createdUsers['vy_camping'];

  // Seed Demo Gear Items (idempotent by title + ownerId)
  const demoGearList = [
    {
      ownerId: vyUser._id,
      categoryId: categoryMap['TENT']._id,
      categoryCode: 'TENT',
      title: '[DEMO] Lều Naturehike Cloud Up 2 (2 người, chống mưa PU4000mm)',
      description:
        'Lều 2 lớp siêu nhẹ 1.7kg khung nhôm 7001 chịu gió tốt. Đầy đủ cọc lều, dây chằng gió và tấm lót đáy footprint. Phù hợp đi cắm trại Hồ Đồng Đò hoặc trekking Lảo Thẩn, Tà Xùa.',
      brand: 'Naturehike',
      condition: GearCondition.LIKE_NEW,
      attributes: {
        capacityPersons: 2,
        waterproofMm: 4000,
        weightKg: 1.7,
      },
      images: [
        'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=900&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 2,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 80000,
      dailyPriceVnd: 80000,
      depositAmount: 500000,
      depositAmountVnd: 500000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.827, 21.018],
      },
      usageRules: [
        'Phơi khô lều trước khi gấp trả nếu gặp trời mưa',
        'Không đốt lửa hoặc nấu ăn bên trong lều',
      ],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 10,
        advanceNoticeHours: 4,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: quanUser._id,
      categoryId: categoryMap['TREKKING_POLES']._id,
      categoryCode: 'TREKKING_POLES',
      title: '[DEMO] Cặp gậy Trekking Carbon Naturehike ST06 siêu nhẹ',
      description:
        'Cặp 2 gậy leo núi sợi carbon 3 khúc khóa bật nhanh, tay cầm gỗ bần thấm mồ hôi tốt. Giảm áp lực khớp gối khi leo Yên Tử, Lảo Thẩn, Bạch Mộc.',
      brand: 'Naturehike',
      condition: GearCondition.GOOD,
      attributes: {
        material: 'Sợi Carbon 3K',
        maxLengthCm: 135,
      },
      images: [
        'https://images.unsplash.com/photo-1551632811-561732d1e306?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 3,
      sharingType: GearListingType.BOTH,
      listingType: GearListingType.BOTH,
      pricePerDay: 35000,
      dailyPriceVnd: 35000,
      depositAmount: 250000,
      depositAmountVnd: 250000,
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.7906, 21.0362],
      },
      usageRules: ['Không khóa quá vạch STOP trên thân gậy', 'Lau sạch bùn đất sau chuyến đi'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 14,
        advanceNoticeHours: 2,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: quanUser._id,
      categoryId: categoryMap['HEADLAMP']._id,
      categoryCode: 'HEADLAMP',
      title: '[DEMO] Đèn đội đầu Black Diamond Spot 400 chống nước IPX8',
      description:
        'Đèn đội đầu chuyên dụng cho leo núi săn mây sáng sớm. Hỗ trợ cho các bạn sinh viên mượn miễn phí đi trekking cuối tuần (chỉ cần đặt cọc giữ đồ).',
      brand: 'Black Diamond',
      condition: GearCondition.GOOD,
      attributes: {
        lumens: 400,
        batteryHours: 30,
      },
      images: [
        'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 2,
      sharingType: GearListingType.FREE_LOAN,
      listingType: GearListingType.FREE_LOAN,
      pricePerDay: 0,
      dailyPriceVnd: 0,
      depositAmount: 200000,
      depositAmountVnd: 200000,
      city: 'Hà Nội',
      district: 'Cầu Giấy',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.792, 21.035],
      },
      usageRules: ['Tháo pin nếu không sử dụng qua ngày để tránh chảy pin'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 7,
        advanceNoticeHours: 6,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: vyUser._id,
      categoryId: categoryMap['BACKPACK']._id,
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Trekking Osprey Atmos AG 50L trợ lực chống gù',
      description:
        'Balo khung trợ lực Anti-Gravity cực êm lưng và hông, kèm áo mưa balo chính hãng. Dung tích 50L thoải mái cho chuyến đi 2-4 ngày.',
      brand: 'Osprey',
      condition: GearCondition.LIKE_NEW,
      attributes: {
        capacityLiters: 50,
        hasRainCover: true,
      },
      images: [
        'https://images.unsplash.com/photo-1622260614153-03223fb72052?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 90000,
      dailyPriceVnd: 90000,
      depositAmount: 800000,
      depositAmountVnd: 800000,
      city: 'Hà Nội',
      district: 'Thanh Xuân',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.8045, 20.9938],
      },
      usageRules: ['Không giặt máy giặt', 'Giữ lại áo mưa balo ở ngăn đáy'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 14,
        advanceNoticeHours: 4,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: quanUser._id,
      categoryId: categoryMap['BACKPACK']._id,
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Trekking Deuter Futura Pro 36L trợ lực (Đống Đa)',
      description:
        'Balo khung lưới thoáng lưng Aircomfort chính hãng Deuter, dung tích 36L lý tưởng cho các cung trekking 1-2 ngày như Yên Tử, Lảo Thẩn, Hàm Lợn.',
      brand: 'Deuter',
      condition: GearCondition.LIKE_NEW,
      attributes: {
        capacityLiters: 36,
        hasRainCover: true,
      },
      images: [
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 70000,
      dailyPriceVnd: 70000,
      depositAmount: 500000,
      depositAmountVnd: 500000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.8265, 21.0175],
      },
      usageRules: ['Không đựng vật sắc nhọn không bọc', 'Lau sạch đáy balo sau chuyến đi'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 14,
        advanceNoticeHours: 2,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: vyUser._id,
      categoryId: categoryMap['BACKPACK']._id,
      categoryCode: 'BACKPACK',
      title: '[DEMO] Balo Trekking Naturehike 45L chống nước (Đống Đa - Kín lịch mẫu)',
      description:
        'Balo trekking 45L siêu nhẹ chống nước đi rừng. Thiết bị mẫu dùng để kiểm thử bộ lọc loại trừ thiết bị bị trùng lịch giữ chỗ.',
      brand: 'Naturehike',
      condition: GearCondition.GOOD,
      attributes: {
        capacityLiters: 45,
        hasRainCover: true,
      },
      images: [
        'https://images.unsplash.com/photo-1622260614153-03223fb72052?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 1,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 60000,
      dailyPriceVnd: 60000,
      depositAmount: 400000,
      depositAmountVnd: 400000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.828, 21.019],
      },
      usageRules: ['Giữ nguyên đai bụng trợ lực'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 14,
        advanceNoticeHours: 4,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
    {
      ownerId: quanUser._id,
      categoryId: categoryMap['TREKKING_SHOES']._id,
      categoryCode: 'TREKKING_SHOES',
      title: '[DEMO] Giày Trekking Salomon X Ultra 4 Gore-Tex cổ lửng (Size 41)',
      description:
        'Giày leo núi chống trượt đế Contagrip siêu bám đá rêu ẩm tại Yên Tử, Ba Vì, Tam Đảo. Đã khử khuẩn tia UV sạch sẽ sau mỗi chuyến đi.',
      brand: 'Salomon',
      condition: GearCondition.LIKE_NEW,
      attributes: {
        sizeEu: 41,
        size: '41',
        waterproof: true,
      },
      images: [
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&auto=format&fit=crop&q=80',
      ],
      totalQuantity: 2,
      sharingType: GearListingType.RENT,
      listingType: GearListingType.RENT,
      pricePerDay: 85000,
      dailyPriceVnd: 85000,
      depositAmount: 600000,
      depositAmountVnd: 600000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: {
        type: 'Point' as const,
        coordinates: [105.825, 21.016],
      },
      usageRules: ['Mang tất dày cổ cao khi sử dụng', 'Không sấy nhiệt độ cao'],
      availabilitySettings: {
        minRentalDays: 1,
        maxRentalDays: 10,
        advanceNoticeHours: 4,
      },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    },
  ];

  const seededGearDocs: any[] = [];
  for (const g of demoGearList) {
    const doc = await GearItemModel.findOneAndUpdate(
      { title: g.title, ownerId: g.ownerId },
      { $set: g },
      { upsert: true, new: true },
    );
    seededGearDocs.push(doc);
  }
  console.log(`Seeded ${seededGearDocs.length} demo gear items.`);

  // Seed a sample unavailable period for the first demo tent
  if (seededGearDocs[0]) {
    const tentId = seededGearDocs[0]._id;
    const blockStart = new Date('2026-11-25T00:00:00.000Z');
    const blockEnd = new Date('2026-11-27T00:00:00.000Z');
    await AvailabilityModel.updateOne(
      { gearId: tentId, startAt: blockStart, endAt: blockEnd },
      {
        $set: {
          gearId: tentId,
          startAt: blockStart,
          endAt: blockEnd,
          startDate: blockStart,
          endDate: blockEnd,
          reservedQuantity: 1,
          reason: 'OWNER_BLOCKED',
          note: '[DEMO] Chủ đồ tự sử dụng đi cắm trại Hồ Đồng Đò',
        },
      },
      { upsert: true },
    );
  }

  // Seed unavailable period for the blocked demo backpack in Đống Đa so Phase 7 matching filters it out
  const blockedBackpackDoc = seededGearDocs.find((d) =>
    String(d.title).includes('Kín lịch mẫu'),
  );
  if (blockedBackpackDoc) {
    const bpBlockStart = new Date('2026-11-01T00:00:00.000Z');
    const bpBlockEnd = new Date('2027-01-15T00:00:00.000Z');
    await AvailabilityModel.updateOne(
      { gearId: blockedBackpackDoc._id, startAt: bpBlockStart, endAt: bpBlockEnd },
      {
        $set: {
          gearId: blockedBackpackDoc._id,
          startAt: bpBlockStart,
          endAt: bpBlockEnd,
          startDate: bpBlockStart,
          endDate: bpBlockEnd,
          reservedQuantity: 1,
          reason: 'OWNER_BLOCKED',
          note: '[DEMO] Thiết bị đã kín lịch để kiểm thử bộ lọc khả dụng Phase 7',
        },
      },
      { upsert: true },
    );
  }

  // Seed Phase 4 Demo Bookings, Handovers, and Reviews
  const existingDemoBookings = await BookingModel.countDocuments({ isDemo: true });
  if (existingDemoBookings === 0 && seededGearDocs.length >= 2 && vyUser && quanUser) {
    const tentGear = seededGearDocs[0];
    const polesGear = seededGearDocs[1];

    // 1. Completed Booking (Quan rented Vy's Tent)
    const completedStart = new Date('2026-11-01T00:00:00.000Z');
    const completedEnd = new Date('2026-11-03T00:00:00.000Z');
    const completedBooking = await BookingModel.create({
      gearId: tentGear._id,
      renterId: quanUser._id,
      ownerId: vyUser._id,
      quantity: 1,
      startAt: completedStart,
      endAt: completedEnd,
      startDate: completedStart,
      endDate: completedEnd,
      rentalDays: 2,
      totalDays: 2,
      sharingType: GearListingType.RENT,
      status: BookingStatus.COMPLETED,
      priceSnapshot: 85000,
      unitDailyPriceSnapshotVnd: 85000,
      rentalTotal: 170000,
      totalRentalFeeSnapshotVnd: 170000,
      depositAmount: 500000,
      depositSnapshotVnd: 500000,
      pickupLocationSnapshot: {
        city: tentGear.city,
        district: tentGear.district,
        coordinates: tentGear.pickupLocation.coordinates,
        gearTitle: tentGear.title,
        brand: tentGear.brand,
        condition: tentGear.condition,
        usageRules: tentGear.usageRules,
        images: tentGear.images,
      },
      renterNote: 'Mình mượn lều đi cắm trại Hồ Đồng Đò cuối tuần, cam kết vệ sinh khô ráo trước khi trả.',
      ownerResponseNote: 'Đã duyệt! Anh Quân ghé nhận đồ tại Đống Đa sau 18h nhé.',
      approvedAt: new Date('2026-10-30T10:00:00.000Z'),
      handedOverAt: new Date('2026-11-01T01:00:00.000Z'),
      returnedAt: new Date('2026-11-03T11:00:00.000Z'),
      completedAt: new Date('2026-11-03T12:00:00.000Z'),
      statusHistory: [
        {
          fromStatus: null,
          toStatus: BookingStatus.PENDING,
          actorId: String(quanUser._id),
          actorRole: 'RENTER',
          note: 'Tạo yêu cầu thuê thiết bị',
          timestamp: new Date('2026-10-30T08:00:00.000Z'),
        },
        {
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.APPROVED,
          actorId: String(vyUser._id),
          actorRole: 'OWNER',
          note: 'Chủ thiết bị chấp nhận yêu cầu thuê',
          timestamp: new Date('2026-10-30T10:00:00.000Z'),
        },
        {
          fromStatus: BookingStatus.APPROVED,
          toStatus: BookingStatus.IN_USE,
          actorId: String(quanUser._id),
          actorRole: 'RENTER',
          note: 'Hai bên đã xác nhận bàn giao thiết bị thành công',
          timestamp: new Date('2026-11-01T01:00:00.000Z'),
        },
        {
          fromStatus: BookingStatus.IN_USE,
          toStatus: BookingStatus.RETURN_PENDING,
          actorId: String(quanUser._id),
          actorRole: 'RENTER',
          note: 'Người thuê gửi xác nhận hoàn trả thiết bị',
          timestamp: new Date('2026-11-03T11:00:00.000Z'),
        },
        {
          fromStatus: BookingStatus.RETURN_PENDING,
          toStatus: BookingStatus.COMPLETED,
          actorId: String(vyUser._id),
          actorRole: 'OWNER',
          note: 'Chủ thiết bị xác nhận đã nhận lại thiết bị nguyên vẹn',
          timestamp: new Date('2026-11-03T12:00:00.000Z'),
        },
      ],
      isDemo: true,
    });

    await HandoverModel.create([
      {
        bookingId: completedBooking._id,
        handoverType: HandoverType.PICKUP,
        photos: tentGear.images,
        condition: GearCondition.LIKE_NEW,
        notes: 'Đầy đủ khung nhôm, 12 cọc lều, bạt lót đáy sạch sẽ.',
        confirmedBy: [vyUser._id, quanUser._id],
        confirmations: [
          {
            userId: String(vyUser._id),
            role: 'OWNER',
            confirmedAt: new Date('2026-11-01T00:45:00.000Z'),
            note: 'Đã kiểm tra đủ phụ kiện trước khi giao.',
            photos: tentGear.images,
            condition: GearCondition.LIKE_NEW,
          },
          {
            userId: String(quanUser._id),
            role: 'RENTER',
            confirmedAt: new Date('2026-11-01T01:00:00.000Z'),
            note: 'Đã nhận lều đúng mô tả.',
            photos: [],
            condition: GearCondition.LIKE_NEW,
          },
        ],
      },
      {
        bookingId: completedBooking._id,
        handoverType: HandoverType.RETURN,
        photos: tentGear.images,
        condition: GearCondition.LIKE_NEW,
        notes: 'Đã phơi khô bạt lều và lau sạch cọc nhôm trước khi trả.',
        confirmedBy: [quanUser._id, vyUser._id],
        confirmations: [
          {
            userId: String(quanUser._id),
            role: 'RENTER',
            confirmedAt: new Date('2026-11-03T11:00:00.000Z'),
            note: 'Bàn giao trả lều sạch đẹp.',
            photos: tentGear.images,
            condition: GearCondition.LIKE_NEW,
          },
          {
            userId: String(vyUser._id),
            role: 'OWNER',
            confirmedAt: new Date('2026-11-03T12:00:00.000Z'),
            note: 'Đã nhận lại lều nguyên vẹn và hoàn cọc đầy đủ.',
            photos: [],
            condition: GearCondition.LIKE_NEW,
          },
        ],
      },
    ]);

    await ReviewModel.create([
      {
        bookingId: completedBooking._id,
        gearId: tentGear._id,
        reviewerId: quanUser._id,
        targetUserId: vyUser._id,
        reviewerRole: 'RENTER',
        rating: 5,
        comment: 'Lều rất mới, chống mưa sương cực tốt. Bạn Vy hỗ trợ nhiệt tình và đúng giờ!',
      },
      {
        bookingId: completedBooking._id,
        gearId: tentGear._id,
        reviewerId: vyUser._id,
        targetUserId: quanUser._id,
        reviewerRole: 'OWNER',
        rating: 5,
        comment: 'Anh Quân giữ đồ rất kỹ, trả lều đã phơi khô sạch sẽ. Rất uy tín!',
      },
    ]);

    // 2. Pending Booking (Vy requests to rent Quan's Trekking Poles)
    const pendingStart = new Date('2026-12-05T00:00:00.000Z');
    const pendingEnd = new Date('2026-12-08T00:00:00.000Z');
    await BookingModel.create({
      gearId: polesGear._id,
      renterId: vyUser._id,
      ownerId: quanUser._id,
      quantity: 1,
      startAt: pendingStart,
      endAt: pendingEnd,
      startDate: pendingStart,
      endDate: pendingEnd,
      rentalDays: 3,
      totalDays: 3,
      sharingType: GearListingType.RENT,
      status: BookingStatus.PENDING,
      priceSnapshot: 35000,
      unitDailyPriceSnapshotVnd: 35000,
      rentalTotal: 105000,
      totalRentalFeeSnapshotVnd: 105000,
      depositAmount: 250000,
      depositSnapshotVnd: 250000,
      pickupLocationSnapshot: {
        city: polesGear.city,
        district: polesGear.district,
        coordinates: polesGear.pickupLocation.coordinates,
        gearTitle: polesGear.title,
        brand: polesGear.brand,
        condition: polesGear.condition,
        usageRules: polesGear.usageRules,
        images: polesGear.images,
      },
      renterNote: 'Em đặt thuê cặp gậy carbon đi cung Tà Xùa 3 ngày cuối tuần tới anh Quân nhé!',
      expiresAt: new Date('2026-12-04T00:00:00.000Z'),
      statusHistory: [
        {
          fromStatus: null,
          toStatus: BookingStatus.PENDING,
          actorId: String(vyUser._id),
          actorRole: 'RENTER',
          note: 'Tạo yêu cầu thuê cặp gậy trekking',
          timestamp: new Date(),
        },
      ],
      isDemo: true,
    });
  }

  const demoCommunities = [
    {
      slug: 'trekking-viet-nam',
      name: 'Trekking Việt Nam',
      description: 'Cộng đồng chia sẻ kinh nghiệm chinh phục các cung trekking từ Bắc vào Nam: Yên Tử, Lảo Thẩn, Tà Xùa, Bạch Mộc Lương Tử, Tà Năng - Phan Dũng.',
      coverUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1000&auto=format&fit=crop&q=80',
      avatarUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=300&auto=format&fit=crop&q=80',
      activityType: ActivityType.TREKKING,
      rules: ['Chia sẻ thông tin cung đường trung thực', 'Leave No Trace - Không xả rác trên rừng', 'Tôn trọng thành viên và người dẫn đoàn'],
      ownerId: quanUser?._id || adminUser._id,
      membersCount: 3,
      isActive: true,
      isDemo: true,
    },
    {
      slug: 'camping-da-ngoai',
      name: 'Camping & Dã ngoại',
      description: 'Giao lưu địa điểm cắm trại cuối tuần quanh Hà Nội, Đà Lạt, Hồ Trị An, chia sẻ kinh nghiệm dựng lều, nấu ăn dã ngoại và cho thuê/mượn đồ camping.',
      coverUrl: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1000&auto=format&fit=crop&q=80',
      avatarUrl: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=300&auto=format&fit=crop&q=80',
      activityType: ActivityType.CAMPING,
      rules: ['Không quảng cáo spam bán hàng', 'Thu dọn sạch bãi trại và dập tắt hoàn toàn bếp lửa trước khi rời đi'],
      ownerId: vyUser?._id || adminUser._id,
      membersCount: 2,
      isActive: true,
      isDemo: true,
    },
    {
      slug: 'review-thiet-bi-du-lich',
      name: 'Review thiết bị du lịch',
      description: 'Đánh giá thực tế lều trại, balo trợ lực, giày trekking, đèn pin, bếp dã ngoại trước khi quyết định thuê hoặc mua.',
      coverUrl: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=1000&auto=format&fit=crop&q=80',
      avatarUrl: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=300&auto=format&fit=crop&q=80',
      activityType: ActivityType.BACKPACKING,
      rules: ['Đánh giá khách quan dựa trên trải nghiệm thực tế', 'Ghi rõ điều kiện thời tiết và địa hình khi thử nghiệm thiết bị'],
      ownerId: adminUser._id,
      membersCount: 2,
      isActive: true,
      isDemo: true,
    },
  ];

  for (const comm of demoCommunities) {
    const upserted = await CommunityModel.findOneAndUpdate(
      { slug: comm.slug },
      { $setOnInsert: comm },
      { upsert: true, new: true },
    );
    if (upserted) {
      await CommunityMemberModel.updateOne(
        { communityId: upserted._id, userId: comm.ownerId },
        { $setOnInsert: { role: CommunityRole.OWNER } },
        { upsert: true },
      );
      if (vyUser && String(comm.ownerId) !== String(vyUser._id) && comm.slug === 'trekking-viet-nam') {
        await CommunityMemberModel.updateOne(
          { communityId: upserted._id, userId: vyUser._id },
          { $setOnInsert: { role: CommunityRole.MODERATOR } },
          { upsert: true },
        );
      }
    }
  }

  const existingDemoPosts = await PostModel.countDocuments({ isDemo: true });
  if (existingDemoPosts === 0 && quanUser && vyUser) {
    const post1 = await PostModel.create({
      authorId: quanUser._id,
      content:
        'Săn biển mây Lảo Thẩn (2.860m) thành công mỹ mãn! Nhiệt độ ban đêm trên lán xuống khoảng 6°C, gió khá mạnh ở sống lưng khủng long. Anh em đi đợt tháng 11 nhớ chuẩn bị gậy trekking trợ lực, đèn đội đầu và túi ngủ chịu nhiệt tốt nhé. #laothan #trekkingvietnam #sanmayyty',
      mediaUrls: [
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1000&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1000&auto=format&fit=crop&q=80',
      ],
      hashtags: ['#laothan', '#trekkingvietnam', '#sanmayyty'],
      locationName: 'Đỉnh Lảo Thẩn (2.860m), Y Tý, Lào Cai',
      activityType: ActivityType.TREKKING,
      gearTags: seededGearDocs[1] && seededGearDocs[2] ? [seededGearDocs[1]._id, seededGearDocs[2]._id] : [],
      likesCount: 2,
      commentsCount: 1,
      isFeatured: true,
      isDemo: true,
    });

    await CommentModel.create({
      postId: post1._id,
      authorId: vyUser._id,
      content: 'Biển mây đỉnh quá anh Quân ơi! Đường từ thôn Phìn Hồ lên lán nghỉ có bị lầy không ạ?',
      isEdited: false,
    });

    await PostModel.create({
      authorId: vyUser._id,
      content:
        'Cuối tuần đổi gió cắm trại bên hồ Đồng Đò chỉ cách trung tâm Hà Nội 45 phút di chuyển. Mình còn dư 1 bộ lều Naturehike Cloud Up 2 cho bạn nào ở khu vực Đống Đa muốn mượn/thuê tuần tới! #campinghanoi #hodongdo #chiasedocamping',
      mediaUrls: [
        'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1000&auto=format&fit=crop&q=80',
      ],
      hashtags: ['#campinghanoi', '#hodongdo', '#chiasedocamping'],
      locationName: 'Hồ Đồng Đò, Sóc Sơn, Hà Nội',
      activityType: ActivityType.CAMPING,
      gearTags: seededGearDocs[0] ? [seededGearDocs[0]._id] : [],
      likesCount: 1,
      commentsCount: 0,
      isFeatured: true,
      isDemo: true,
    });
  } else if (seededGearDocs.length >= 2) {
    // Link gearTags to existing demo posts if not already linked
    await PostModel.updateOne(
      { isDemo: true, hashtags: '#laothan' },
      { $set: { gearTags: [seededGearDocs[1]._id, seededGearDocs[2]._id] } },
    );
    await PostModel.updateOne(
      { isDemo: true, hashtags: '#hodongdo' },
      { $set: { gearTags: [seededGearDocs[0]._id] } },
    );
  }

  // Seed Phase 5 Demo Conversation, Messages & Transaction Notifications
  if (quanUser && vyUser && seededGearDocs[0]) {
    const sortedPair = [String(quanUser._id), String(vyUser._id)].sort();
    const pairKey = `${sortedPair[0]}:${sortedPair[1]}`;
    const tentGear = seededGearDocs[0];
    const latestBooking = await BookingModel.findOne({
      ownerId: vyUser._id,
      renterId: quanUser._id,
    }).lean();

    const activeContext = latestBooking
      ? {
          type: 'BOOKING',
          refId: String(latestBooking._id),
          title: `Giao dịch #${String(latestBooking._id).slice(-6).toUpperCase()} • ${tentGear.title}`,
          subtitle: `Trạng thái: ${latestBooking.status} • ${latestBooking.rentalDays || 2} ngày`,
          status: latestBooking.status,
          imageUrl: tentGear.images?.[0] || '',
          targetUrl: `/bookings/${String(latestBooking._id)}`,
        }
      : {
          type: 'GEAR',
          refId: String(tentGear._id),
          title: tentGear.title,
          subtitle: `${tentGear.pricePerDay.toLocaleString('vi-VN')} ₫/ngày • ${tentGear.district}, ${tentGear.city}`,
          status: tentGear.status,
          imageUrl: tentGear.images?.[0] || '',
          targetUrl: `/gear/${String(tentGear._id)}`,
        };

    const conv = await ConversationModel.findOneAndUpdate(
      { participantPairKey: pairKey },
      {
        $setOnInsert: {
          participants: sortedPair.map((id) => new mongoose.Types.ObjectId(id)),
          participantPairKey: pairKey,
          activeContext,
          lastMessagePreview:
            'Cảm ơn Vy nhiều nhé! Lều chống mưa gió cực tốt, mình đã phơi khô sạch sẽ trước khi hoàn trả.',
          lastMessageAt: new Date(),
          readReceipts: {
            [String(quanUser._id)]: { lastReadAt: new Date() },
            [String(vyUser._id)]: { lastReadAt: new Date() },
          },
        },
      },
      { upsert: true, new: true },
    );

    const existingMessages = await MessageModel.countDocuments({
      conversationId: conv._id,
    });
    if (existingMessages === 0) {
      await MessageModel.create([
        {
          conversationId: conv._id,
          senderId: quanUser._id,
          clientMessageId: 'seed-msg-quan-1',
          content:
            'Chào Vy, mình muốn thuê bộ lều Naturehike Cloud Up 2 cuối tuần này đi cắm trại Hồ Đồng Đò. Cho mình hỏi chiều thứ 6 mình qua Đống Đa nhận lều lúc 18h30 được không?',
          contextCard: activeContext,
          readBy: [quanUser._id, vyUser._id],
        },
        {
          conversationId: conv._id,
          senderId: vyUser._id,
          clientMessageId: 'seed-msg-vy-2',
          content:
            'Chào anh Quân! 18h30 chiều thứ 6 mình có ở nhà nhé. Mình đã chuẩn bị sẵn đầy đủ cọc lều nhôm và tấm lót đáy footprint cho anh rồi ạ.',
          contextCard: null,
          readBy: [quanUser._id, vyUser._id],
        },
        {
          conversationId: conv._id,
          senderId: quanUser._id,
          clientMessageId: 'seed-msg-quan-3',
          content:
            'Cảm ơn Vy nhiều nhé! Lều chống mưa gió cực tốt, mình đã phơi khô sạch sẽ trước khi hoàn trả.',
          contextCard: null,
          readBy: [quanUser._id, vyUser._id],
        },
      ]);
    }

    if (latestBooking) {
      const bId = String(latestBooking._id);
      const shortCode = `#${bId.slice(-6).toUpperCase()}`;
      const seedNotifs = [
        {
          recipientId: vyUser._id,
          actorId: quanUser._id,
          bookingId: latestBooking._id,
          gearId: tentGear._id,
          type: NotificationType.BOOKING_COMPLETED,
          dedupeKey: `booking:${bId}:completed:${String(vyUser._id)}`,
          title: `Giao dịch ${shortCode} hoàn tất!`,
          body: 'Bạn đã nhận lại thiết bị thành công. Hãy gửi đánh giá uy tín (1-5 sao) cho người thuê nhé!',
          targetUrl: `/bookings/${bId}`,
          isRead: false,
          readAt: null,
        },
        {
          recipientId: quanUser._id,
          actorId: vyUser._id,
          bookingId: latestBooking._id,
          gearId: tentGear._id,
          type: NotificationType.BOOKING_COMPLETED,
          dedupeKey: `booking:${bId}:completed:${String(quanUser._id)}`,
          title: `Giao dịch ${shortCode} hoàn tất!`,
          body: 'Thiết bị đã được hoàn trả thành công. Hãy gửi đánh giá uy tín (1-5 sao) cho chủ thiết bị nhé!',
          targetUrl: `/bookings/${bId}`,
          isRead: false,
          readAt: null,
        },
      ];

      for (const n of seedNotifs) {
        await NotificationModel.updateOne(
          { dedupeKey: n.dedupeKey },
          { $setOnInsert: n },
          { upsert: true },
        );
      }
    }
  }

  await mongoose.disconnect();
  console.log('Seed completed successfully!');
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
