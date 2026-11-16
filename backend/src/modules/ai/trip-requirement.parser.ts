import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import {
  ActivityType,
  ExperienceLevel,
  normalizeLegacyActivity,
  TripEnvironment,
} from '../../common/enums/system.enums';
import {
  AiIntentType,
  ValidatedTripState,
} from '../../database/schemas/ai-checklist.schema';
import {
  ChecklistOperationIntent,
  GEAR_CATALOG_METADATA,
  ParsedChecklistOperation,
} from '../checklists/checklist-mutation.engine';

export type { ChecklistOperationIntent, ParsedChecklistOperation };

export type AiErrorCode =
  | 'TIMEOUT'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_SCHEMA'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR';

export type TurnActionType =
  | 'SMALL_TALK'
  | 'GENERAL_QA'
  | 'ITINERARY_ADVICE'
  | 'DESTINATION_QA'
  | 'SUGGEST_SPOTS'
  | 'SAVED_SPOTS_READ'
  | 'MISSING_ITEMS_READ'
  | 'FIND_RENTAL_GEAR'
  | 'CHECKLIST_ITEM_READ'
  | 'CHECKLIST_VIEW'
  | 'CHECKLIST_CREATE'
  | 'TRIP_UPDATE'
  | 'CHECKLIST_MUTATION';

export interface RecentMessageContext {
  role: 'user' | 'assistant' | 'system';
  content: string;
  qaSubjectDestination?: string | null;
  structuredPayload?: Record<string, any> | null;
}

export class AiProviderException extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AiProviderException';
  }
}

export interface ExtractedTripPatch {
  updatedFields: Partial<ValidatedTripState>;
  clearedFields: Array<keyof ValidatedTripState>;
  ownedGearMode?: 'ADD' | 'REPLACE' | 'CLEAR';
  checklistOperations?: ParsedChecklistOperation[];
  turnActions?: TurnActionType[];
  qaQuestion?: string | null;
  qaSubjectDestination?: string | null;
  destinationAnswer?: string | null;
  generalAnswer?: string | null;
  itineraryAnswer?: string | null;
  qaNeedsLiveDisclaimer?: boolean;
  readChecklistCodes?: string[];
  requestChecklistPrint?: boolean;
  requestChecklistCreate?: boolean;
  requestMissingItemsList?: boolean;
  requestRentalGearMatch?: boolean;
  requestSavedSpotsRead?: boolean;
  requestSpotSuggestions?: boolean;
  spotSuggestionsAnswer?: string | null;
  preliminaryGearSuggestion?: string | null;
  isHowToQuestion?: boolean;
  isUnrecognizedFallback?: boolean;
  providerFailureCode?: AiErrorCode | null;
  providerFailureNote?: string | null;
  ambiguousDateNote?: string | null;
  assistantHint?: string | null;
  providerMeta: {
    source: 'GEMINI' | 'VIETNAMESE_NLP_PARSER';
    model: string;
    latencyMs: number;
    step?: string;
    qaSource?: 'GEMINI' | 'LOCAL_KNOWLEDGE' | 'NONE';
    fallbackReason?: AiErrorCode;
    abortedOnTimeout?: boolean;
  };
}

export type CustomGeminiGenerator = (
  prompt: string,
  signal?: AbortSignal,
) => Promise<string>;

const VIETNAMESE_NUMBER_WORDS: Record<string, number> = {
  một: 1,
  mot: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  bon: 4,
  tư: 4,
  tu: 4,
  năm: 5,
  nam: 5,
  sáu: 6,
  sau: 6,
  bảy: 7,
  bay: 7,
  tám: 8,
  tam: 8,
  chín: 9,
  chin: 9,
  mười: 10,
  muoi: 10,
  'mười một': 11,
  'mười hai': 12,
  'mười lăm': 15,
  'hai mươi': 20,
};

const KNOWN_DESTINATIONS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /tây\s+yên\s*tử/i, canonical: 'Tây Yên Tử' },
  { pattern: /yên\s*tử/i, canonical: 'Yên Tử' },
  { pattern: /tà\s*xùa/i, canonical: 'Tà Xùa' },
  { pattern: /lảo\s*thẩn/i, canonical: 'Lảo Thẩn' },
  { pattern: /fansipan|phan\s*xi\s*păng/i, canonical: 'Fansipan' },
  {
    pattern: /bạch\s*mộc\s*lương\s*tử|ky\s*quan\s*san/i,
    canonical: 'Bạch Mộc Lương Tử',
  },
  { pattern: /putaleng|pu\s*ta\s*leng/i, canonical: 'Putaleng' },
  { pattern: /lùng\s*cúng/i, canonical: 'Lùng Cúng' },
  { pattern: /nhìu\s*cồ\s*san/i, canonical: 'Nhìu Cồ San' },
  { pattern: /hồ\s*đồng\s*đò/i, canonical: 'Hồ Đồng Đò' },
  { pattern: /hàm\s*lợn/i, canonical: 'Núi Hàm Lợn' },
  { pattern: /(?:vườn\s*quốc\s*gia|vqg)?\s*ba\s*vì/i, canonical: 'Vườn Quốc gia Ba Vì' },
  {
    pattern: /(?:vườn\s*quốc\s*gia|vqg)?\s*cúc\s*phương/i,
    canonical: 'Vườn Quốc gia Cúc Phương',
  },
  { pattern: /tà\s*năng\s*[-–]?\s*phan\s*dũng/i, canonical: 'Tà Năng - Phan Dũng' },
  { pattern: /tà\s*năng/i, canonical: 'Tà Năng - Phan Dũng' },
  { pattern: /bidoup/i, canonical: 'Bidoup - Núi Bà' },
  {
    pattern: /(?:vườn\s*quốc\s*gia|vqg)\s*cát\s*bà/i,
    canonical: 'Vườn Quốc gia Cát Bà',
  },
  { pattern: /vịnh\s*lan\s*hạ/i, canonical: 'Vịnh Lan Hạ' },
  { pattern: /cát\s*bà/i, canonical: 'Cát Bà' },
  { pattern: /phú\s*quốc/i, canonical: 'Phú Quốc' },
  { pattern: /cô\s*tô/i, canonical: 'Cô Tô' },
  { pattern: /mẫu\s*sơn/i, canonical: 'Mẫu Sơn' },
  { pattern: /sapa|sa\s*pa/i, canonical: 'Sa Pa' },
  { pattern: /mộc\s*châu/i, canonical: 'Mộc Châu' },
  { pattern: /hà\s*giang/i, canonical: 'Hà Giang' },
  { pattern: /đà\s*lạt/i, canonical: 'Đà Lạt' },
  { pattern: /núi\s*chứa\s*chan/i, canonical: 'Núi Chứa Chan' },
  { pattern: /núi\s*bà\s*đen/i, canonical: 'Núi Bà Đen' },
];

const OWNED_GEAR_LEXICON: Array<{
  pattern: RegExp;
  code: string;
  labelVi: string;
  unit: string;
}> = [
    {
      pattern: /lều\s*cắm\s*trại|lều\s*trại|(?:^|[\s,.;])lều(?=$|[\s,.;])|\btent\b/i,
      code: 'TENT',
      labelVi: 'lều',
      unit: 'bộ',
    },
    {
      pattern:
        /ghế\s*xếp|ghế\s*camping|ghế\s*gấp|bàn\s*ghế|(?:^|[\s,.;])ghế(?=$|[\s,.;])/i,
      code: 'CAMPING_CHAIR',
      labelVi: 'ghế xếp',
      unit: 'chiếc',
    },
    {
      pattern: /balo|ba\s*lô|\bbackpack\b/i,
      code: 'BACKPACK',
      labelVi: 'balo',
      unit: 'chiếc',
    },
    {
      pattern: /túi\s*ngủ|\bsleeping\s*bag\b/i,
      code: 'SLEEPING_BAG',
      labelVi: 'túi ngủ',
      unit: 'chiếc',
    },
    {
      pattern: /giày\s*trekking|giày\s*leo\s*núi|(?:^|[\s,.;])giày(?=$|[\s,.;])/i,
      code: 'TREKKING_SHOES',
      labelVi: 'giày trekking',
      unit: 'đôi',
    },
    {
      pattern: /gậy\s*trekking|gậy\s*leo\s*núi|(?:^|[\s,.;])gậy(?=$|[\s,.;])/i,
      code: 'TREKKING_POLES',
      labelVi: 'gậy trekking',
      unit: 'cặp',
    },
    {
      pattern: /áo\s*mưa|áo\s*khoác|áo\s*gió|\bjacket\b/i,
      code: 'RAIN_JACKET',
      labelVi: 'áo khoác / áo mưa',
      unit: 'bộ',
    },
    {
      pattern: /đèn\s*đội\s*đầu|đèn\s*pin|đèn\s*lồng|\bheadlamp\b/i,
      code: 'HEADLAMP',
      labelVi: 'đèn đội đầu',
      unit: 'chiếc',
    },
    {
      pattern:
        /bếp\s*dã\s*ngoại|bếp\s*gas|bếp\s*nấu|bộ\s*nồi|(?:^|[\s,.;])bếp(?=$|[\s,.;])/i,
      code: 'CAMPING_STOVE',
      labelVi: 'bếp dã ngoại',
      unit: 'bộ',
    },
    {
      pattern:
        /tấm\s*bạt|tăng\s*bạt|bạt\s*che|bạt\s*lót|(?:^|[\s,.;])bạt(?=$|[\s,.;])|\btarp\b/i,
      code: 'TARP',
      labelVi: 'tấm bạt',
      unit: 'tấm',
    },
    {
      pattern: /máy\s*ảnh|\bcamera\b|\bgopro\b|action\s*cam/i,
      code: 'CAMERA',
      labelVi: 'máy ảnh',
      unit: 'chiếc',
    },
    {
      pattern: /đồ\s*bơi|quần\s*bơi|áo\s*bơi|\bswimwear\b/i,
      code: 'SWIMWEAR',
      labelVi: 'đồ bơi',
      unit: 'bộ',
    },
    {
      pattern: /khăn\s*tắm/i,
      code: 'BEACH_TOWEL',
      labelVi: 'khăn tắm',
      unit: 'chiếc',
    },
    {
      pattern: /dép\s*đi\s*biển|dép\s*lê/i,
      code: 'BEACH_SANDALS',
      labelVi: 'dép đi biển',
      unit: 'đôi',
    },
    {
      pattern: /kem\s*chống\s*nắng|kính\s*râm/i,
      code: 'SUN_PROTECTION',
      labelVi: 'chống nắng & kính râm',
      unit: 'bộ',
    },
    {
      pattern: /túi\s*khô|túi\s*chống\s*nước|\bdry\s*bag\b/i,
      code: 'DRY_BAG',
      labelVi: 'túi chống nước',
      unit: 'chiếc',
    },
    {
      pattern: /mũ\s*bảo\s*hiểm|\bhelmet\b/i,
      code: 'HELMET',
      labelVi: 'mũ bảo hiểm',
      unit: 'chiếc',
    },
    {
      pattern: /sạc\s*dự\s*phòng|pin\s*dự\s*phòng/i,
      code: 'POWER_BANK',
      labelVi: 'sạc dự phòng',
      unit: 'chiếc',
    },
    {
      pattern: /giày\s*đi\s*bộ|giày\s*thể\s*thao/i,
      code: 'WALKING_SHOES',
      labelVi: 'giày đi bộ',
      unit: 'đôi',
    },
  ];

export const TRIP_EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    turnIntent: {
      type: SchemaType.STRING,
      enum: [
        'SMALL_TALK',
        'DESTINATION_QA',
        'SUGGEST_SPOTS',
        'SAVED_SPOTS_READ',
        'MISSING_ITEMS_READ',
        'FIND_RENTAL_GEAR',
        'GENERAL_QA',
        'ITINERARY_ADVICE',
        'TRIP_PLANNING',
        'CHECKLIST_READ',
        'CHECKLIST_VIEW',
        'CHECKLIST_CREATE',
        'CHECKLIST_MUTATION',
        'MIXED',
      ],
      nullable: true,
    },
    qaAnswer: {
      type: SchemaType.STRING,
      description:
        'Câu trả lời tiếng Việt tự nhiên cho chào hỏi, hỏi đáp kiến thức, giới thiệu địa điểm hoặc gợi ý lịch trình sơ bộ (không bịa giá vé/giờ mở cửa/thời tiết hôm nay)',
      nullable: true,
    },
    intent: {
      type: SchemaType.STRING,
      enum: ['PREPARE_TRIP', 'FIND_RENTAL_GEAR', 'GENERAL_QA'],
      nullable: true,
    },
    destination: {
      type: SchemaType.STRING,
      nullable: true,
    },
    route: {
      type: SchemaType.STRING,
      nullable: true,
    },
    activity: {
      type: SchemaType.STRING,
      enum: [
        'TREKKING',
        'CAMPING',
        'MOTORBIKE_TOUR',
        'BACKPACKING',
        'MOUNTAINEERING',
        'BEACH',
        'SIGHTSEEING',
        'OTHER',
      ],
      nullable: true,
    },
    environment: {
      type: SchemaType.STRING,
      enum: ['COASTAL', 'MOUNTAIN', 'FOREST', 'URBAN'],
      nullable: true,
    },
    isOvernight: {
      type: SchemaType.BOOLEAN,
      nullable: true,
    },
    secondaryActivities: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      nullable: true,
    },
    departureDate: {
      type: SchemaType.STRING,
      description: 'YYYY-MM-DD in Asia/Ho_Chi_Minh timezone if explicitly stated',
      nullable: true,
    },
    durationDays: {
      type: SchemaType.INTEGER,
      nullable: true,
    },
    travelers: {
      type: SchemaType.INTEGER,
      nullable: true,
    },
    experienceLevel: {
      type: SchemaType.STRING,
      enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
      nullable: true,
    },
    ownedGear: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      nullable: true,
    },
    budgetVnd: {
      type: SchemaType.INTEGER,
      nullable: true,
    },
    pickupArea: {
      type: SchemaType.STRING,
      nullable: true,
    },
    wantsToRent: {
      type: SchemaType.BOOLEAN,
      nullable: true,
    },
    clearedFields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      nullable: true,
    },
    ambiguousDateNote: {
      type: SchemaType.STRING,
      nullable: true,
    },
  },
};

@Injectable()
export class TripRequirementParser {
  private readonly logger = new Logger(TripRequirementParser.name);
  private customGenerator?: CustomGeminiGenerator;
  private customQaGenerator?: CustomGeminiGenerator;
  private customGeneratorOptions: { allowFallbackOnError?: boolean } = {};

  constructor(private readonly configService: ConfigService) { }

  /**
   * Allow unit/integration tests to inject a mock Gemini generator (to test 404, schema errors, timeouts, quota, AbortSignal)
   */
  setCustomGeminiGenerator(
    generator?: CustomGeminiGenerator,
    options?: { allowFallbackOnError?: boolean },
  ) {
    this.customGenerator = generator;
    this.customGeneratorOptions = options || {};
  }

  /**
   * Allow tests to mock or override the Gemini Destination QA generator
   */
  setCustomQaGenerator(generator?: CustomGeminiGenerator) {
    this.customQaGenerator = generator;
  }

  hasGeminiApiKey(): boolean {
    const key = this.configService.get<string>('gemini.apiKey');
    return Boolean(key && key.trim().length > 5);
  }

  /**
   * Parse user message in Vietnamese into structured turn actions, tripState patch, QA context & checklist operations
   */
  async parseUserTurn(
    userMessage: string,
    currentTripState: ValidatedTripState,
    options?: {
      simulateError?:
      | 'TIMEOUT'
      | 'QUOTA_EXCEEDED'
      | 'INVALID_SCHEMA'
      | 'NOT_FOUND';
      referenceDate?: Date;
      recentMessages?: RecentMessageContext[];
      lastAssistantQuestion?: string | null;
      existingChecklistItems?: Array<{
        categoryCode: string;
        name: string;
        quantityRequired: number;
        quantityOwned: number;
        quantityMissing: number;
      }>;
    },
  ): Promise<ExtractedTripPatch> {
    const startTime = Date.now();
    const modelName =
      this.configService.get<string>('gemini.model') || 'gemini-3.5-flash';

    // Handle explicit error simulation for testing resilience
    if (options?.simulateError === 'NOT_FOUND') {
      this.logger.warn(
        `[AI][step=REQUIREMENT_PARSE] model=${modelName} code=NOT_FOUND httpStatus=404 durationMs=${Date.now() - startTime} simulated=true`,
      );
      throw new AiProviderException(
        'NOT_FOUND',
        `Không tìm thấy mô hình AI "${modelName}" trên Gemini API (404 Model Not Found). Trạng thái chuyến đi vẫn được giữ nguyên.`,
        404,
      );
    }
    if (options?.simulateError === 'TIMEOUT') {
      this.logger.warn(
        `[AI][step=REQUIREMENT_PARSE] model=${modelName} code=TIMEOUT httpStatus=504 durationMs=${Date.now() - startTime} simulated=true`,
      );
      throw new AiProviderException(
        'TIMEOUT',
        'Yêu cầu phân tích tới Gemini vượt quá thời gian chờ (Timeout). Thông tin chuyến đi của bạn vẫn được giữ nguyên, vui lòng thử lại.',
        504,
      );
    }
    if (options?.simulateError === 'QUOTA_EXCEEDED') {
      this.logger.warn(
        `[AI][step=REQUIREMENT_PARSE] model=${modelName} code=QUOTA_EXCEEDED httpStatus=429 durationMs=${Date.now() - startTime} simulated=true`,
      );
      throw new AiProviderException(
        'QUOTA_EXCEEDED',
        'Hệ thống Gemini tạm thời vượt hạn mức (Quota 429). Trạng thái chuyến đi đã lưu không bị ảnh hưởng, bạn có thể thử gửi lại.',
        429,
      );
    }
    if (options?.simulateError === 'INVALID_SCHEMA') {
      this.logger.warn(
        `[AI][step=REQUIREMENT_PARSE] model=${modelName} code=INVALID_SCHEMA httpStatus=502 durationMs=${Date.now() - startTime} simulated=true`,
      );
      throw new AiProviderException(
        'INVALID_SCHEMA',
        'Phản hồi từ mô hình AI không khớp lược đồ dữ liệu (Invalid Schema). Đã giữ nguyên trạng thái hợp lệ trước đó.',
        502,
      );
    }

    const convContext = this.extractConversationContext(
      options?.recentMessages || [],
      currentTripState,
      options?.lastAssistantQuestion,
    );

    // 1. Analyze latest turn clauses using conversation history & current trip/checklist state
    const nlpPatch = this.extractVietnameseTripPatch(
      userMessage,
      currentTripState,
      options?.referenceDate,
      convContext,
    );

    const turnActions = nlpPatch.turnActions || [];
    const hasSmallTalkOnly =
      turnActions.length === 1 && turnActions[0] === 'SMALL_TALK';
    const hasDestinationQa = turnActions.includes('DESTINATION_QA');
    const hasGeneralQa = turnActions.includes('GENERAL_QA');
    const hasItineraryAdvice = turnActions.includes('ITINERARY_ADVICE');
    const hasPlanningOrMutationText =
      Object.keys(nlpPatch.updatedFields).length > 0 ||
      nlpPatch.clearedFields.length > 0 ||
      (nlpPatch.checklistOperations?.length || 0) > 0 ||
      Boolean(nlpPatch.ambiguousDateNote) ||
      Boolean(nlpPatch.requestChecklistCreate);

    const hasReadOnlyActionsOnly =
      !hasPlanningOrMutationText &&
      (hasSmallTalkOnly ||
        hasGeneralQa ||
        hasItineraryAdvice ||
        hasDestinationQa ||
        turnActions.includes('SUGGEST_SPOTS') ||
        turnActions.includes('SAVED_SPOTS_READ') ||
        turnActions.includes('MISSING_ITEMS_READ') ||
        turnActions.includes('CHECKLIST_ITEM_READ') ||
        turnActions.includes('CHECKLIST_VIEW'));

    // Deterministic fast-paths (zero external LLM latency & resilient when Gemini fails):
    // 1) Pure greetings/thanks ("Chào bạn", "Cảm ơn")
    if (!this.customGenerator && hasSmallTalkOnly && !hasPlanningOrMutationText) {
      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `[AI][step=SMALL_TALK] model=${modelName} durationMs=${latencyMs} source=VIETNAMESE_NLP_PARSER`,
      );
      return {
        ...nlpPatch,
        providerMeta: {
          source: 'VIETNAMESE_NLP_PARSER',
          model: modelName,
          latencyMs,
          step: 'SMALL_TALK',
          qaSource: 'NONE',
        },
      };
    }

    // 2) Pure checklist/saved-state read/view ("Còn thiếu mấy balo?", "Nhóm còn thiếu những đồ gì?", "Mình đã chọn những điểm nào?", "Cho tôi xem checklist") without QA
    if (
      !this.customGenerator &&
      !hasDestinationQa &&
      !hasGeneralQa &&
      !hasItineraryAdvice &&
      !turnActions.includes('SUGGEST_SPOTS') &&
      !turnActions.includes('FIND_RENTAL_GEAR') &&
      hasReadOnlyActionsOnly
    ) {
      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `[AI][step=READ_INTENT] model=${modelName} durationMs=${latencyMs} source=VIETNAMESE_NLP_PARSER actions=${turnActions.join(',')}`,
      );
      return {
        ...nlpPatch,
        providerMeta: {
          source: 'VIETNAMESE_NLP_PARSER',
          model: modelName,
          latencyMs,
          step: 'READ_INTENT',
          qaSource: 'NONE',
        },
      };
    }

    // 3) Pure checklist item commands ("Thêm 2 balo", "Nhóm đã có 1 lều", "Bỏ ghế xếp khỏi checklist", "Bớt 1 balo")
    const hasOnlyChecklistOrOwnedUpdates =
      !hasDestinationQa &&
      !hasGeneralQa &&
      !hasItineraryAdvice &&
      (nlpPatch.checklistOperations?.length || 0) > 0 &&
      Object.keys(nlpPatch.updatedFields).every(
        (k) => k === 'ownedGear' || k === 'ownedGearQuantities',
      ) &&
      nlpPatch.clearedFields.length === 0;

    if (!this.customGenerator && hasOnlyChecklistOrOwnedUpdates) {
      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `[AI][step=CHECKLIST_COMMAND] model=${modelName} durationMs=${latencyMs} source=VIETNAMESE_NLP_PARSER`,
      );
      return {
        ...nlpPatch,
        providerMeta: {
          source: 'VIETNAMESE_NLP_PARSER',
          model: modelName,
          latencyMs,
          step: 'CHECKLIST_COMMAND',
          qaSource: 'NONE',
        },
      };
    }

    let finalPatch: Omit<ExtractedTripPatch, 'providerMeta'> = { ...nlpPatch };
    let usedGeminiExtraction = false;
    let abortedOnTimeout = false;
    let fallbackReason: AiErrorCode | undefined;
    let fallbackErrorMessage: string | undefined;
    let geminiQaAnswer: string | null = null;

    // Determine whether we should invoke Gemini structured analysis / conversational generation:
    // - Whenever a test injects `customGenerator`
    // - Whenever API key is present and the turn has planning extraction, unknown/open-ended intent, or general/itinerary Q&A
    const hasAnyRecognizedDeterministicIntent =
      hasPlanningOrMutationText ||
      hasDestinationQa ||
      hasGeneralQa ||
      hasItineraryAdvice ||
      turnActions.includes('SUGGEST_SPOTS') ||
      turnActions.includes('SAVED_SPOTS_READ') ||
      turnActions.includes('MISSING_ITEMS_READ') ||
      turnActions.includes('FIND_RENTAL_GEAR') ||
      turnActions.includes('CHECKLIST_ITEM_READ') ||
      turnActions.includes('CHECKLIST_VIEW') ||
      hasSmallTalkOnly;

    const shouldInvokeExtraction =
      (this.customGenerator || this.hasGeminiApiKey()) &&
      (!hasReadOnlyActionsOnly ||
        !hasAnyRecognizedDeterministicIntent ||
        hasGeneralQa ||
        hasItineraryAdvice);

    if (shouldInvokeExtraction) {
      try {
        const rawJsonText = await this.invokeGeminiWithTimeout(
          this.buildExtractionPrompt(
            userMessage,
            currentTripState,
            options?.recentMessages || [],
            options?.existingChecklistItems || [],
            convContext.lastMentionedDestination,
          ),
          modelName,
          {
            step: 'REQUIREMENT_PARSE',
            responseSchema: TRIP_EXTRACTION_RESPONSE_SCHEMA,
          },
        );
        const geminiPatch = this.validateAndNormalizeGeminiPatch(rawJsonText);
        usedGeminiExtraction = true;
        geminiQaAnswer = geminiPatch.qaAnswer || null;

        const SafeGeminiUpdated: Partial<ValidatedTripState> = {
          ...geminiPatch.updatedFields,
        };

        // Guard against Gemini guessing TREKKING or overwriting existing fields on QA/chat/checklist-only turns
        if (
          nlpPatch.checklistOperations &&
          nlpPatch.checklistOperations.length > 0
        ) {
          if (nlpPatch.updatedFields.travelers === undefined) {
            delete SafeGeminiUpdated.travelers;
          }
          if (nlpPatch.updatedFields.durationDays === undefined) {
            delete SafeGeminiUpdated.durationDays;
          }
          if (nlpPatch.updatedFields.activity === undefined) {
            delete SafeGeminiUpdated.activity;
          }
          if (nlpPatch.updatedFields.destination === undefined) {
            delete SafeGeminiUpdated.destination;
          }
        }
        if (hasDestinationQa && !nlpPatch.updatedFields.destination) {
          delete SafeGeminiUpdated.destination;
        }
        if (
          SafeGeminiUpdated.activity &&
          nlpPatch.updatedFields.activity === undefined &&
          !this.textMentionsExplicitActivity(userMessage)
        ) {
          delete SafeGeminiUpdated.activity;
        }

        const isGeminiPureQaOrChat =
          (geminiPatch.turnIntent === 'SMALL_TALK' ||
            geminiPatch.turnIntent === 'GENERAL_QA' ||
            geminiPatch.turnIntent === 'DESTINATION_QA' ||
            geminiPatch.turnIntent === 'SUGGEST_SPOTS' ||
            geminiPatch.turnIntent === 'SAVED_SPOTS_READ' ||
            geminiPatch.turnIntent === 'MISSING_ITEMS_READ') &&
          !hasPlanningOrMutationText;

        if (isGeminiPureQaOrChat) {
          delete SafeGeminiUpdated.destination;
          delete SafeGeminiUpdated.activity;
          delete SafeGeminiUpdated.environment;
          delete SafeGeminiUpdated.isOvernight;
          delete SafeGeminiUpdated.secondaryActivities;
          delete SafeGeminiUpdated.durationDays;
          delete SafeGeminiUpdated.travelers;
          delete SafeGeminiUpdated.intent;
        }

        const mergedUpdated: Partial<ValidatedTripState> = {
          ...SafeGeminiUpdated,
          ...nlpPatch.updatedFields,
        };

        if (
          nlpPatch.updatedFields.ownedGear?.length ||
          SafeGeminiUpdated.ownedGear?.length
        ) {
          mergedUpdated.ownedGear = Array.from(
            new Set([
              ...(SafeGeminiUpdated.ownedGear || []),
              ...(nlpPatch.updatedFields.ownedGear || []),
            ]),
          );
        }

        if (nlpPatch.updatedFields.ownedGearQuantities) {
          mergedUpdated.ownedGearQuantities = {
            ...nlpPatch.updatedFields.ownedGearQuantities,
          };
        }

        const mergedCleared = Array.from(
          new Set([
            ...geminiPatch.clearedFields,
            ...nlpPatch.clearedFields,
          ]),
        ) as Array<keyof ValidatedTripState>;

        const mergedActions = new Set<TurnActionType>(turnActions);
        if (geminiPatch.turnIntent === 'GENERAL_QA' || (geminiQaAnswer && isGeminiPureQaOrChat)) {
          mergedActions.add('GENERAL_QA');
        }
        if (geminiPatch.turnIntent === 'SMALL_TALK') {
          mergedActions.add('SMALL_TALK');
        }
        if (geminiPatch.turnIntent === 'ITINERARY_ADVICE') {
          mergedActions.add('ITINERARY_ADVICE');
        }
        if (geminiPatch.turnIntent === 'DESTINATION_QA') {
          mergedActions.add('DESTINATION_QA');
        }
        if (
          geminiPatch.turnIntent === 'SUGGEST_SPOTS' ||
          geminiPatch.turnIntent === 'SAVED_SPOTS_READ' ||
          geminiPatch.turnIntent === 'MISSING_ITEMS_READ' ||
          geminiPatch.turnIntent === 'FIND_RENTAL_GEAR'
        ) {
          mergedActions.add(geminiPatch.turnIntent as TurnActionType);
        }
        if (geminiPatch.turnIntent === 'SUGGEST_SPOTS') {
          finalPatch.requestSpotSuggestions = true;
        }
        if (geminiPatch.turnIntent === 'SAVED_SPOTS_READ') {
          finalPatch.requestSavedSpotsRead = true;
        }
        if (geminiPatch.turnIntent === 'MISSING_ITEMS_READ') {
          finalPatch.requestMissingItemsList = true;
        }
        if (geminiPatch.turnIntent === 'FIND_RENTAL_GEAR') {
          finalPatch.requestRentalGearMatch = true;
        }
        if (
          Object.keys(mergedUpdated).some(
            (k) => k !== 'ownedGear' && k !== 'ownedGearQuantities',
          ) ||
          mergedCleared.length > 0
        ) {
          mergedActions.add('TRIP_UPDATE');
        }

        finalPatch = {
          ...finalPatch,
          updatedFields: mergedUpdated,
          clearedFields: mergedCleared,
          ownedGearMode: nlpPatch.ownedGearMode || geminiPatch.ownedGearMode,
          checklistOperations: nlpPatch.checklistOperations || [],
          turnActions: Array.from(mergedActions),
          ambiguousDateNote:
            nlpPatch.ambiguousDateNote || geminiPatch.ambiguousDateNote,
        };
      } catch (err: any) {
        const classified = this.classifyProviderError(err, modelName);
        if (classified.code === 'TIMEOUT') {
          abortedOnTimeout = true;
        }
        fallbackReason = classified.code;
        fallbackErrorMessage = classified.message;

        const allowFallback =
          !this.customGenerator ||
          Boolean(this.customGeneratorOptions.allowFallbackOnError);

        if (
          !allowFallback ||
          (!this.customGeneratorOptions.allowFallbackOnError &&
            classified.code === 'INVALID_SCHEMA' &&
            this.customGenerator)
        ) {
          throw classified;
        }

        this.logger.warn(
          `[AI][step=REQUIREMENT_PARSE] model=${modelName} code=${classified.code} httpStatus=${classified.httpStatus ?? 500} durationMs=${Date.now() - startTime} fallback=VIETNAMESE_NLP_PARSER message=${classified.message}`,
        );
      }
    }

    // 3. Answer DESTINATION_QA / SUGGEST_SPOTS if requested in the latest message
    let qaSource: 'GEMINI' | 'LOCAL_KNOWLEDGE' | 'NONE' = 'NONE';
    const effectiveHasDestinationQa =
      hasDestinationQa ||
      (finalPatch.turnActions || []).includes('DESTINATION_QA');
    if (effectiveHasDestinationQa || finalPatch.requestSpotSuggestions) {
      const qaSubject =
        finalPatch.qaSubjectDestination ||
        finalPatch.updatedFields.destination ||
        convContext.lastMentionedDestination ||
        currentTripState.destination ||
        null;
      const qaResult = await this.resolveDestinationQa(
        userMessage,
        finalPatch.qaQuestion || userMessage,
        qaSubject,
        currentTripState,
        modelName,
        geminiQaAnswer,
        Boolean(finalPatch.requestSpotSuggestions),
      );
      finalPatch.qaSubjectDestination = qaSubject;
      finalPatch.destinationAnswer = qaResult.answer;
      finalPatch.qaNeedsLiveDisclaimer = qaResult.needsLiveDisclaimer;
      qaSource = qaResult.qaSource;
      if (qaResult.abortedOnTimeout) {
        abortedOnTimeout = true;
      }
    }

    // 4. Handle GENERAL_QA / ITINERARY_ADVICE / open-ended conversational answer
    const effectiveActions = finalPatch.turnActions || [];
    const hasMutatingOrReadAction =
      Object.keys(finalPatch.updatedFields).length > 0 ||
      finalPatch.clearedFields.length > 0 ||
      (finalPatch.checklistOperations?.length || 0) > 0 ||
      (finalPatch.readChecklistCodes?.length || 0) > 0 ||
      Boolean(finalPatch.requestChecklistPrint) ||
      Boolean(finalPatch.requestChecklistCreate) ||
      Boolean(finalPatch.requestMissingItemsList) ||
      Boolean(finalPatch.requestRentalGearMatch) ||
      Boolean(finalPatch.requestSavedSpotsRead) ||
      Boolean(finalPatch.requestSpotSuggestions) ||
      effectiveHasDestinationQa ||
      hasSmallTalkOnly;

    if (
      effectiveActions.includes('ITINERARY_ADVICE') &&
      !finalPatch.itineraryAnswer
    ) {
      if (geminiQaAnswer) {
        finalPatch.itineraryAnswer = geminiQaAnswer;
        qaSource = 'GEMINI';
      } else {
        const itRes = await this.resolveGeneralOrItineraryAnswer(
          'ITINERARY_ADVICE',
          userMessage,
          currentTripState,
          modelName,
          options?.recentMessages || [],
          fallbackReason,
        );
        finalPatch.itineraryAnswer = itRes.answer;
        if (itRes.qaSource !== 'NONE') qaSource = itRes.qaSource;
        if (itRes.providerFailureCode) {
          fallbackReason = itRes.providerFailureCode;
          fallbackErrorMessage = itRes.providerFailureNote || fallbackErrorMessage;
        }
      }
    } else if (
      (effectiveActions.includes('GENERAL_QA') || !hasMutatingOrReadAction) &&
      !finalPatch.generalAnswer
    ) {
      if (geminiQaAnswer) {
        finalPatch.generalAnswer = geminiQaAnswer;
        qaSource = 'GEMINI';
        if (!effectiveActions.includes('GENERAL_QA')) {
          finalPatch.turnActions = [...effectiveActions, 'GENERAL_QA'];
        }
      } else {
        const genRes = await this.resolveGeneralOrItineraryAnswer(
          'GENERAL_QA',
          userMessage,
          currentTripState,
          modelName,
          options?.recentMessages || [],
          fallbackReason,
        );
        if (genRes.answer) {
          finalPatch.generalAnswer = genRes.answer;
          qaSource = genRes.qaSource;
          if (!effectiveActions.includes('GENERAL_QA')) {
            finalPatch.turnActions = [...effectiveActions, 'GENERAL_QA'];
          }
        } else if (genRes.providerFailureCode) {
          finalPatch.providerFailureCode = genRes.providerFailureCode;
          finalPatch.providerFailureNote =
            genRes.providerFailureNote || fallbackErrorMessage || null;
        }
      }
    }

    const totalLatency = Date.now() - startTime;
    const isUnrecognized =
      !hasMutatingOrReadAction &&
      !finalPatch.generalAnswer &&
      !finalPatch.itineraryAnswer &&
      !finalPatch.ambiguousDateNote &&
      !finalPatch.providerFailureCode;

    if (fallbackReason && isUnrecognized) {
      finalPatch.providerFailureCode = fallbackReason;
      finalPatch.providerFailureNote =
        fallbackErrorMessage ||
        this.buildRetryNoticeForCode(fallbackReason, modelName);
    } else if (isUnrecognized) {
      finalPatch.isUnrecognizedFallback = true;
      this.logger.warn(
        `[AI][step=INTENT_CLASSIFY] model=${modelName} code=UNRECOGNIZED_INTENT durationMs=${totalLatency} source=VIETNAMESE_NLP_PARSER`,
      );
    }

    const source: 'GEMINI' | 'VIETNAMESE_NLP_PARSER' =
      usedGeminiExtraction || qaSource === 'GEMINI'
        ? 'GEMINI'
        : 'VIETNAMESE_NLP_PARSER';

    const stepName = hasDestinationQa
      ? hasPlanningOrMutationText
        ? 'COMBINED_QA_AND_PARSE'
        : 'DESTINATION_QA'
      : effectiveActions.includes('ITINERARY_ADVICE')
        ? 'ITINERARY_ADVICE'
        : effectiveActions.includes('GENERAL_QA')
          ? 'GENERAL_QA'
          : hasSmallTalkOnly
            ? 'SMALL_TALK'
            : 'REQUIREMENT_PARSE';

    this.logger.log(
      `[AI][step=${stepName}] model=${modelName} durationMs=${totalLatency} source=${source} qaSource=${qaSource}${fallbackReason ? ` fallbackReason=${fallbackReason}` : ''}`,
    );

    return {
      ...finalPatch,
      providerMeta: {
        source,
        model: modelName,
        latencyMs: totalLatency,
        step: stepName,
        qaSource,
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(abortedOnTimeout ? { abortedOnTimeout: true } : {}),
      },
    };
  }

  private buildExtractionPrompt(
    userMessage: string,
    currentTripState: ValidatedTripState,
    recentMessages: RecentMessageContext[] = [],
    existingChecklistItems: Array<{
      categoryCode: string;
      name: string;
      quantityRequired: number;
      quantityOwned: number;
      quantityMissing: number;
    }> = [],
    lastMentionedDestination?: string | null,
  ): string {
    const historyLines = recentMessages
      .slice(-6)
      .map(
        (m) =>
          `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${String(m.content || '').slice(0, 220)}`,
      )
      .join('\n');

    return [
      'Bạn là Trợ lý AI TravelShare tại Việt Nam (chatbot du lịch & chuẩn bị đồ dã ngoại).',
      'Hãy phân tích Ý ĐỊNH CỦA TIN NHẮN MỚI NHẤT dựa trên lịch sử hội thoại gần đây, tripState hiện tại và danh sách checklist đang lưu.',
      'QUY TẮC BẮT BUỘC:',
      '1. Nếu người dùng chỉ chào hỏi, cảm ơn (`SMALL_TALK`), hỏi kiến thức chung (`GENERAL_QA`), hỏi thông tin địa điểm (`DESTINATION_QA`), gợi ý điểm chơi (`SUGGEST_SPOTS`), hỏi lại điểm đã chọn (`SAVED_SPOTS_READ`) hoặc hỏi danh sách đồ đang thiếu (`MISSING_ITEMS_READ`): trả `turnIntent` tương ứng, viết `qaAnswer` tự nhiên bằng tiếng Việt nếu phù hợp, và ĐỂ `destination/activity/durationDays/travelers` là `null` nếu họ chưa chốt thay đổi kế hoạch.',
      '2. KHÔNG tự gán `activity = "TREKKING"` khi người dùng chỉ nói "Tôi muốn đi Ba Vì", "Tôi muốn đi Cát Bà" hoặc "mình muốn đi ở đó" mà chưa nêu loại hoạt động.',
      '3. Phân biệt hoạt động chính xác theo enum chính thức (`TREKKING`, `CAMPING`, `MOTORBIKE_TOUR`, `BACKPACKING`, `MOUNTAINEERING`, `BEACH`, `SIGHTSEEING`, `OTHER`): đi biển ban ngày -> `BEACH` + `environment = "COASTAL"`; cắm trại qua đêm ở bãi biển -> `CAMPING` + `environment = "COASTAL"` + `isOvernight = true`; tham quan/ngắm cảnh -> `SIGHTSEEING`.',
      '4. Giữ nguyên tên đầy đủ của địa điểm khi người dùng chỉ định cụ thể (ví dụ "Đổi địa điểm thành Vườn Quốc gia Cát Bà đi" -> `destination = "Vườn Quốc gia Cát Bà"`, KHÔNG rút gọn thành "Cát Bà").',
      '5. Với câu hỏi địa điểm hoặc lịch trình: KHÔNG bịa giá vé hôm nay, giờ mở cửa hôm nay hay thời tiết thời gian thực nếu không có nguồn cập nhật.',
      '6. Nếu tin nhắn nhắc "ở đó", tham chiếu tới địa điểm vừa nhắc trong hội thoại (`' +
      (lastMentionedDestination || currentTripState.destination || 'chưa có') +
      '`).',
      '7. Nếu người dùng yêu cầu tìm thuê đồ còn thiếu, đặt `turnIntent = "FIND_RENTAL_GEAR"` và `wantsToRent = true`.',
      '8. Nếu yêu cầu xóa trường đã nhập, đưa tên trường vào `clearedFields`.',
      historyLines ? `Lịch sử gần đây:\n${historyLines}` : 'Chưa có lịch sử trước đó.',
      `tripState hiện tại: ${JSON.stringify(currentTripState)}`,
      existingChecklistItems.length > 0
        ? `Checklist hiện tại: ${JSON.stringify(
          existingChecklistItems.map((i) => ({
            code: i.categoryCode,
            name: i.name,
            required: i.quantityRequired,
            owned: i.quantityOwned,
            missing: i.quantityMissing,
          })),
        )}`
        : 'Chưa tạo checklist.',
      `Tin nhắn mới nhất của người dùng: "${userMessage}"`,
    ].join('\n');
  }

  private classifyProviderError(err: any, modelName: string): AiProviderException {
    if (err instanceof AiProviderException) {
      return err;
    }
    const status = Number(err?.status || err?.statusCode || err?.response?.status);
    const msg = String(err?.message || err || '');

    if (
      status === 404 ||
      /\b404\b|not found|models\/.*not/i.test(msg)
    ) {
      return new AiProviderException(
        'NOT_FOUND',
        `Không tìm thấy mô hình AI "${modelName}" (404). Trạng thái chuyến đi đã được giữ nguyên.`,
        404,
      );
    }
    if (
      status === 429 ||
      /429|quota|rate limit|resource_exhausted/i.test(msg)
    ) {
      return new AiProviderException(
        'QUOTA_EXCEEDED',
        'Gemini API tạm thời hết hạn mức (Quota 429). Trạng thái chuyến đi đã được bảo toàn.',
        429,
      );
    }
    if (
      err?.name === 'AbortError' ||
      /timeout|timed out|aborted|abort/i.test(msg)
    ) {
      return new AiProviderException(
        'TIMEOUT',
        'Kết nối tới Gemini API quá thời gian chờ (Timeout). Trạng thái chuyến đi đã được bảo toàn.',
        504,
      );
    }
    return new AiProviderException(
      'PROVIDER_ERROR',
      `Lỗi kết nối Gemini API (${msg.slice(0, 120)}).`,
      status || 502,
    );
  }

  private async invokeGeminiWithTimeout(
    prompt: string,
    modelName: string,
    options?: {
      step?: string;
      responseSchema?: Schema;
      responseMimeType?: string;
      generatorOverride?: CustomGeminiGenerator;
    },
  ): Promise<string> {
    const timeoutMs =
      this.configService.get<number>('gemini.timeoutMs') || 60000;
    const step = options?.step || 'GEMINI_CALL';
    const callStart = Date.now();
    const controller = new AbortController();

    const activeCustomGen = options?.generatorOverride || this.customGenerator;

    const callPromise = (async () => {
      if (activeCustomGen) {
        return activeCustomGen(prompt, controller.signal);
      }
      const apiKey = this.configService.get<string>('gemini.apiKey')!;
      const genAI = new GoogleGenerativeAI(apiKey);
      const generationConfig: Record<string, any> = {
        temperature: options?.responseSchema ? 0.1 : 0.4,
      };
      if (options?.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType;
      } else if (options?.responseSchema) {
        generationConfig.responseMimeType = 'application/json';
      }
      if (options?.responseSchema) {
        generationConfig.responseSchema = options.responseSchema;
      }

      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig,
      });
      const result = await model.generateContent(prompt, {
        signal: controller.signal,
        timeout: timeoutMs,
      });
      return result.response.text();
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const exc = new AiProviderException(
          'TIMEOUT',
          `Gemini API không phản hồi sau ${timeoutMs}ms`,
          504,
        );
        reject(exc);
      }, timeoutMs);
    });

    try {
      const output = await Promise.race([callPromise, timeoutPromise]);
      this.logger.log(
        `[AI][step=${step}] model=${modelName} durationMs=${Date.now() - callStart} source=GEMINI outcome=OK`,
      );
      return output;
    } catch (err: any) {
      const classified = this.classifyProviderError(err, modelName);
      this.logger.warn(
        `[AI][step=${step}] model=${modelName} durationMs=${Date.now() - callStart} source=GEMINI outcome=${classified.code}`,
      );
      throw classified;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Validate raw JSON from Gemini against our strict schema
   */
  validateAndNormalizeGeminiPatch(rawJson: string): Omit<
    ExtractedTripPatch,
    'providerMeta'
  > & {
    turnIntent?: string | null;
    qaAnswer?: string | null;
  } {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new AiProviderException(
        'INVALID_SCHEMA',
        'Dữ liệu trả về từ Gemini không phải JSON hợp lệ.',
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AiProviderException(
        'INVALID_SCHEMA',
        'Cấu trúc JSON từ Gemini phải là một đối tượng (Object).',
      );
    }

    const updatedFields: Partial<ValidatedTripState> = {};
    const clearedFields: Array<keyof ValidatedTripState> = [];

    const validTurnIntents = [
      'SMALL_TALK',
      'GENERAL_QA',
      'ITINERARY_ADVICE',
      'DESTINATION_QA',
      'SUGGEST_SPOTS',
      'SAVED_SPOTS_READ',
      'MISSING_ITEMS_READ',
      'FIND_RENTAL_GEAR',
      'CHECKLIST_ITEM_READ',
      'CHECKLIST_READ',
      'CHECKLIST_VIEW',
      'CHECKLIST_CREATE',
      'TRIP_UPDATE',
      'TRIP_PLANNING',
      'CHECKLIST_MUTATION',
      'MIXED',
    ];
    let turnIntent: string | null = null;
    if (parsed.turnIntent !== undefined && parsed.turnIntent !== null) {
      if (
        typeof parsed.turnIntent !== 'string' ||
        !validTurnIntents.includes(parsed.turnIntent)
      ) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          `Giá trị turnIntent không hợp lệ: ${String(parsed.turnIntent)}`,
        );
      }
      turnIntent =
        parsed.turnIntent === 'TRIP_PLANNING'
          ? 'TRIP_UPDATE'
          : parsed.turnIntent === 'CHECKLIST_READ'
            ? 'CHECKLIST_ITEM_READ'
            : parsed.turnIntent;
    }

    let qaAnswer: string | null = null;
    if (parsed.qaAnswer !== undefined && parsed.qaAnswer !== null) {
      if (typeof parsed.qaAnswer !== 'string') {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường qaAnswer phải là chuỗi ký tự.',
        );
      }
      if (parsed.qaAnswer.trim()) {
        qaAnswer = parsed.qaAnswer.trim();
      }
    }

    if (parsed.intent !== undefined && parsed.intent !== null) {
      const validIntents = ['PREPARE_TRIP', 'FIND_RENTAL_GEAR', 'GENERAL_QA'];
      if (!validIntents.includes(parsed.intent)) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          `Giá trị intent không hợp lệ: ${String(parsed.intent)}`,
        );
      }
      updatedFields.intent = parsed.intent as AiIntentType;
    }

    if (parsed.destination !== undefined && parsed.destination !== null) {
      if (typeof parsed.destination !== 'string') {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường destination phải là chuỗi ký tự.',
        );
      }
      if (parsed.destination.trim()) {
        updatedFields.destination = parsed.destination.trim();
      }
    }

    if (parsed.route !== undefined && parsed.route !== null) {
      if (typeof parsed.route !== 'string') {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường route phải là chuỗi ký tự.',
        );
      }
      if (parsed.route.trim()) {
        updatedFields.route = parsed.route.trim();
      }
    }

    if (parsed.activity !== undefined && parsed.activity !== null) {
      const normalizedAct = normalizeLegacyActivity(
        String(parsed.activity),
        parsed.environment,
      );
      if (!normalizedAct.activity) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          `Giá trị activity không hợp lệ: ${String(parsed.activity)}`,
        );
      }
      updatedFields.activity = normalizedAct.activity;
      if (normalizedAct.environment) {
        updatedFields.environment = normalizedAct.environment;
      }
    }

    if (parsed.environment !== undefined && parsed.environment !== null) {
      const validEnvs: TripEnvironment[] = ['COASTAL', 'MOUNTAIN', 'FOREST', 'URBAN'];
      const envUpper = String(parsed.environment).trim().toUpperCase() as TripEnvironment;
      if (!validEnvs.includes(envUpper)) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          `Giá trị environment không hợp lệ: ${String(parsed.environment)}`,
        );
      }
      updatedFields.environment = envUpper;
    }

    if (parsed.isOvernight !== undefined && parsed.isOvernight !== null) {
      if (typeof parsed.isOvernight !== 'boolean') {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường isOvernight phải là boolean.',
        );
      }
      updatedFields.isOvernight = parsed.isOvernight;
    }

    if (Array.isArray(parsed.secondaryActivities)) {
      const normalizedSec = parsed.secondaryActivities
        .map((a: any) => normalizeLegacyActivity(String(a)).activity)
        .filter((a: ActivityType | null): a is ActivityType => Boolean(a));
      if (normalizedSec.length > 0) {
        updatedFields.secondaryActivities = Array.from(new Set(normalizedSec));
      }
    }

    if (parsed.durationDays !== undefined && parsed.durationDays !== null) {
      if (
        typeof parsed.durationDays !== 'number' ||
        !Number.isInteger(parsed.durationDays) ||
        parsed.durationDays < 1 ||
        parsed.durationDays > 60
      ) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường durationDays phải là số nguyên từ 1 đến 60.',
        );
      }
      updatedFields.durationDays = parsed.durationDays;
    }

    if (parsed.travelers !== undefined && parsed.travelers !== null) {
      if (
        typeof parsed.travelers !== 'number' ||
        !Number.isInteger(parsed.travelers) ||
        parsed.travelers < 1 ||
        parsed.travelers > 200
      ) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường travelers phải là số nguyên dương hợp lệ.',
        );
      }
      updatedFields.travelers = parsed.travelers;
    }

    if (
      parsed.experienceLevel !== undefined &&
      parsed.experienceLevel !== null
    ) {
      const validLevels = Object.values(ExperienceLevel) as string[];
      if (!validLevels.includes(parsed.experienceLevel)) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Giá trị experienceLevel không hợp lệ.',
        );
      }
      updatedFields.experienceLevel = parsed.experienceLevel as ExperienceLevel;
    }

    if (parsed.budgetVnd !== undefined && parsed.budgetVnd !== null) {
      if (typeof parsed.budgetVnd !== 'number' || parsed.budgetVnd < 0) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường budgetVnd phải là số không âm.',
        );
      }
      updatedFields.budgetVnd = Math.round(parsed.budgetVnd);
    }

    if (parsed.departureDate !== undefined && parsed.departureDate !== null) {
      if (
        typeof parsed.departureDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(parsed.departureDate)
      ) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường departureDate phải có định dạng YYYY-MM-DD.',
        );
      }
      updatedFields.departureDate = parsed.departureDate;
    }

    if (parsed.pickupArea !== undefined && parsed.pickupArea !== null) {
      if (typeof parsed.pickupArea !== 'string') {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường pickupArea phải là chuỗi ký tự.',
        );
      }
      if (parsed.pickupArea.trim()) {
        updatedFields.pickupArea = parsed.pickupArea.trim();
      }
    }

    if (parsed.ownedGear !== undefined && parsed.ownedGear !== null) {
      if (!Array.isArray(parsed.ownedGear)) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          'Trường ownedGear phải là mảng chuỗi.',
        );
      }
      updatedFields.ownedGear = parsed.ownedGear
        .map((x: any) => String(x).trim().toUpperCase())
        .filter(Boolean);
    }

    if (typeof parsed.wantsToRent === 'boolean') {
      updatedFields.wantsToRent = parsed.wantsToRent;
    }

    if (Array.isArray(parsed.clearedFields)) {
      for (const f of parsed.clearedFields) {
        if (typeof f === 'string') {
          clearedFields.push(f as keyof ValidatedTripState);
        }
      }
    }

    return {
      updatedFields,
      clearedFields,
      ambiguousDateNote: parsed.ambiguousDateNote || null,
      ...(turnIntent ? { turnIntent } : {}),
      ...(qaAnswer ? { qaAnswer } : {}),
    };
  }

  private static readonly DESTINATION_GUIDE_VI: Record<string, string> = {
    'Vườn Quốc gia Ba Vì':
      '**Vườn Quốc gia Ba Vì** (Ba Vì, Hà Nội — cách trung tâm Hà Nội khoảng 50–60km về phía Tây) nổi bật với không khí mát mẻ quanh năm, rừng thông cổ thụ, cung đường đèo lên các cốt 400m – 600m – 1100m, Đỉnh Vua, Đền Thượng, Nhà thờ cổ rêu phong, vườn xương rồng và mùa hoa dã quỳ cuối thu (thường tháng 10–11). Địa hình kết hợp bãi trại dưới tán rừng thông và các tuyến trekking ngắn/trung bình rất phù hợp cắm trại cuối tuần.',
    'Yên Tử':
      '**Khu di tích & rừng quốc gia Yên Tử** (Uông Bí, Quảng Ninh) nổi tiếng với hệ thống bậc đá cổ qua rừng trúc, suối Giải Oan, chùa Hoa Yên và đỉnh chùa Đồng ở độ cao ~1.068m. Đường leo dốc và độ ẩm cao, rất hợp đi trong ngày hoặc kết hợp cáp treo.',
    'Tà Xùa':
      '**Tà Xùa** (Bắc Yên, Sơn La) nổi bật với sống lưng khủng long, biển mây vào sáng sớm, đồi gió và khí hậu vùng núi cao se lạnh, thích hợp săn mây kết hợp cắm trại hoặc trekking.',
    'Hồ Đồng Đò':
      '**Hồ Đồng Đò** (Sóc Sơn, Hà Nội — cách trung tâm ~45km) có mặt hồ phẳng lặng bao quanh bởi đồi thông, phù hợp cắm trại gia đình, nhóm bạn, chèo SUP và BBQ ngoài trời.',
    'Núi Hàm Lợn':
      '**Núi Hàm Lợn** (Sóc Sơn, Hà Nội) có đỉnh cao ~462m cùng hồ Suối Bầu dưới chân núi, rất phổ biến cho người mới tập trekking 1 ngày hoặc cắm trại qua đêm.',
    'Sa Pa':
      '**Sa Pa** (Lào Cai) nổi tiếng với khí hậu vùng cao mát lạnh, ruộng bậc thang Mường Hoa, đỉnh Fansipan và các cung trekking bản Cát Cát – Tả Van – Lao Chải.',
    'Cát Bà':
      '**Cát Bà** (Hải Phòng) nổi tiếng với hệ sinh thái biển đảo vịnh Lan Hạ cùng rừng quốc gia nguyên sinh, phù hợp cả đi biển thư giãn, tham quan lẫn cắm trại ven biển hoặc trekking rừng Kim Giao – đỉnh Ngự Lâm.',
    'Vườn Quốc gia Cát Bà':
      '**Vườn Quốc gia Cát Bà** (Hải Phòng) là khu dự trữ sinh quyển thế giới nổi bật với tuyến trekking rừng Kim Giao – đỉnh Ngự Lâm, động Trung Trang và hệ động thực vật rừng trên núi đá vôi đặc trưng.',
    'Tam Đảo':
      '**Tam Đảo** (Vĩnh Phúc) cách Hà Nội ~80km, khí hậu mát quanh năm, nổi bật với rừng rậm quốc gia, tháp truyền hình và các cung trek ngắn.',
    'Đà Lạt':
      '**Đà Lạt** (Lâm Đồng) nổi bật với rừng thông ôn đới, hồ Tuyền Lâm, đỉnh Langbiang và các cung cắm trại săn mây sáng sớm (nhiệt độ đêm khá lạnh).',
    'Tà Năng - Phan Dũng':
      '**Tà Năng - Phan Dũng** là một trong những cung trekking qua rừng thông – đồi cỏ đẹp nhất Việt Nam, nối từ Lâm Đồng xuống Bình Thuận, đòi hỏi chuẩn bị tốt về giày bám, nước uống và dẫn đường.',
    'Cúc Phương':
      '**Vườn Quốc gia Cúc Phương** (Ninh Bình) là rừng nguyên sinh cổ thụ lâu đời nhất Việt Nam, nổi bật với động Người Xưa, cây chò chỉ ngàn năm và mùa bướm thường rơi vào khoảng tháng 4–5.',
  };

  private static readonly SPOT_SUGGESTIONS_VI: Record<string, string[]> = {
    'Cát Bà': [
      'Bãi tắm Cát Cò 1 – 2 – 3 & Bãi Tùng Thu (tắm biển, chèo kayak, ngắm hoàng hôn)',
      'Vịnh Lan Hạ & Đảo Khỉ (tham quan vịnh, chèo SUP/kayak giữa núi đá vôi)',
      'Vườn Quốc gia Cát Bà – Đỉnh Ngự Lâm (đi bộ rừng Kim Giao ngắm toàn cảnh đảo)',
      'Làng chài cổ Cái Bèo & Pháo đài Thần Công (ngắm biển từ trên cao)',
      'Động Trung Trang & Hang Quân Y (tham quan hang động tự nhiên)',
    ],
    'Vườn Quốc gia Cát Bà': [
      'Rừng Kim Giao – Đỉnh Ngự Lâm (tuyến đi bộ ngắm cảnh đẹp nhất trong Vườn Quốc gia)',
      'Động Trung Trang & Hang Quân Y (tham quan hệ thống hang đá vôi tự nhiên)',
      'Ao Ếch & Làng Việt Hải (tuyến đi xuyên rừng kết hợp tham quan làng cổ)',
    ],
    'Vườn Quốc gia Ba Vì': [
      'Đồi thông cốt 400m (dã ngoại, cắm trại nhẹ, chụp ảnh rừng thông)',
      'Nhà thờ cổ Ba Vì (kiến trúc đá phủ rêu nổi tiếng ở cốt 800m)',
      'Đỉnh Vua & Đền Thượng (săn mây và ngắm cảnh từ cốt 1100m)',
      'Nhà kính Xương Rồng (check-in gần cổng vườn)',
    ],
  };

  private extractConversationContext(
    recentMessages: RecentMessageContext[],
    currentTripState: ValidatedTripState,
    lastAssistantQuestion?: string | null,
  ): {
    lastMentionedDestination: string | null;
    pendingOwnedQuestionCode: string | null;
    pendingDecrementItemCode: string | null;
    pendingFieldQuestion:
    | 'destination'
    | 'activity'
    | 'durationDays'
    | 'travelers'
    | null;
  } {
    let lastMentionedDestination: string | null =
      currentTripState.destination || null;

    // Scan from newest to oldest to find the most recently discussed destination (including QA-only turns)
    for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
      const m = recentMessages[i];
      if (m.qaSubjectDestination) {
        lastMentionedDestination = m.qaSubjectDestination;
        break;
      }
      const txt = m.content || '';
      const matchedKnown = KNOWN_DESTINATIONS.find((d) => d.pattern.test(txt));
      if (matchedKnown) {
        lastMentionedDestination = matchedKnown.canonical;
        break;
      }
    }

    const latestAssistantMsg = [...recentMessages]
      .reverse()
      .find((m) => m.role === 'assistant');
    const qContext = `${lastAssistantQuestion || ''}\n${latestAssistantMsg?.content || ''}`;

    let pendingOwnedQuestionCode: string | null = null;
    const ownedAskMatch = qContext.match(/nhóm đã có bao nhiêu\s+([^?.!\n]+)/i);
    if (ownedAskMatch?.[1]) {
      const matchedItems = this.findLexiconItemsInSegment(ownedAskMatch[1]);
      if (matchedItems[0]) {
        pendingOwnedQuestionCode = matchedItems[0].code;
      }
    }

    let pendingDecrementItemCode: string | null = null;
    const decAskMatch = qContext.match(
      /giảm số (?:lượng )?([^?.!\n]+?)\s*(?:cần chuẩn bị|đã có)/i,
    );
    if (decAskMatch?.[1]) {
      const matchedItems = this.findLexiconItemsInSegment(decAskMatch[1]);
      if (matchedItems[0]) {
        pendingDecrementItemCode = matchedItems[0].code;
      }
    } else if (/giảm số cần chuẩn bị hay giảm số đã có/i.test(qContext)) {
      const matchedItems = this.findLexiconItemsInSegment(qContext);
      if (matchedItems[0]) {
        pendingDecrementItemCode = matchedItems[0].code;
      }
    }

    let pendingFieldQuestion:
      | 'destination'
      | 'activity'
      | 'durationDays'
      | 'travelers'
      | null = null;
    if (/bao nhiêu người|mấy người|số lượng thành viên/i.test(qContext)) {
      pendingFieldQuestion = 'travelers';
    } else if (/mấy ngày|bao nhiêu ngày|bao lâu/i.test(qContext)) {
      pendingFieldQuestion = 'durationDays';
    } else if (/hoạt động|hình thức|trekking.*cắm trại/i.test(qContext)) {
      pendingFieldQuestion = 'activity';
    } else if (/địa điểm nào|đi đâu/i.test(qContext)) {
      pendingFieldQuestion = 'destination';
    }

    return {
      lastMentionedDestination,
      pendingOwnedQuestionCode,
      pendingDecrementItemCode,
      pendingFieldQuestion,
    };
  }

  private textMentionsExplicitActivity(rawText: string): boolean {
    const lower = (rawText || '').toLowerCase();
    return /(?:cắm\s*trại\s*biển|\bbeach\s*camping\b|đi\s*biển|tắm\s*biển|bãi\s*biển|\bbeach\b|tham\s*quan|ngắm\s*cảnh|\bsightseeing\b|\btrekking\b|\btrek\b|đi\s*bộ\s*đường\s*dài|leo\s*núi|\bmountaineering\b|\bcamping\b|cắm\s*trại|dã\s*ngoại|phượt\s*xe\s*máy|chạy\s*xe\s*máy|đi\s*xe\s*máy|\bmotorbike\b|\bbackpacking\b|đi\s*bụi|đi\s*phượt|chèo\s*(?:sup|kayak)|hoạt\s*động\s*khác)/i.test(
      lower,
    );
  }

  private buildRetryNoticeForCode(code: AiErrorCode, modelName: string): string {
    switch (code) {
      case 'NOT_FOUND':
        return `Mô hình Gemini (${modelName}) hiện trả về lỗi không tìm thấy (404). Trạng thái chuyến đi và checklist của bạn vẫn được giữ nguyên; vui lòng kiểm tra cấu hình model hoặc thử lại sau.`;
      case 'QUOTA_EXCEEDED':
        return 'Gemini API tạm thời vượt hạn mức (Quota 429). Trạng thái chuyến đi và checklist của bạn đã được bảo toàn, bạn hãy thử gửi lại sau ít phút nhé.';
      case 'TIMEOUT':
        return 'Gemini API phản hồi quá thời gian chờ (Timeout). Trạng thái chuyến đi và checklist của bạn vẫn an toàn, bạn vui lòng thử gửi lại nhé.';
      case 'INVALID_SCHEMA':
        return 'Phản hồi từ mô hình AI tạm chưa đúng định dạng dữ liệu mong muốn. Dữ liệu đã lưu không bị thay đổi, bạn hãy thử diễn đạt lại ngắn gọn hơn.';
      default:
        return 'Kết nối tới trợ lý AI tạm gián đoạn. Dữ liệu chuyến đi và checklist của bạn vẫn được bảo toàn, vui lòng thử lại sau ít giây.';
    }
  }

  private buildLocalGeneralQaAnswer(userMessage: string): string | null {
    const lower = (userMessage || '').toLowerCase();

    if (/balo\s*trekking.*(?:khác|so\s*với).*balo\s*thường|balo\s*thường.*balo\s*trekking/i.test(lower)) {
      return [
        '**Balo trekking** khác với **balo thông thường** ở 4 điểm chính:',
        '- **Khung trợ lực & đai trợ lực hông/ngực:** Phân bổ 60–70% trọng lượng xuống hông thay vì dồn hết lên vai khi đi đường dài.',
        '- **Dung tích & chia ngăn:** Thường từ 30L–65L với khoang đứng dài, ngăn túi ngủ dưới đáy và điểm móc gậy/tấm thảm bên ngoài.',
        '- **Thoáng lưng & chống thấm:** Lưng lưới thoáng khí giảm mồ hôi và thường kèm áo trùm mưa (rain cover).',
        '- **Balo thường** phù hợp đi làm, đi học hoặc dạo phố ngắn ngày nhờ gọn nhẹ, nhưng dễ gây đau vai khi mang nặng >6–7 kg trên đường dốc.',
      ].join('\n');
    }

    if (/(?:cách|làm\s*sao|hướng\s*dẫn).*(?:thêm|bớt|sửa|xóa|tạo|cập\s*nhật).*(?:checklist|balo|lều|ghế|đồ)/i.test(lower)) {
      return [
        'Bạn có thể cập nhật checklist ngay trong khung chat bằng các câu tự nhiên (hoặc chỉnh trực tiếp ở bảng Checklist bên phải):',
        '- **Cập nhật số đồ đã có:** `"Nhóm đã có 2 balo"`, `"Nhóm có thêm 2 balo rồi"`',
        '- **Đổi số lượng cần chuẩn bị:** `"Balo mình muốn 3 cái"`, `"Tăng số lượng balo lên là 3"`, `"Thêm 1 tấm bạt"`',
        '- **Bỏ một món khỏi danh sách:** `"Bỏ ghế xếp khỏi checklist"`, hoặc `"Cho tôi xem checklist"` để kiểm tra lại toàn bộ.',
      ].join('\n');
    }

    return null;
  }

  private buildLocalItineraryAdvice(
    userMessage: string,
    currentTripState: ValidatedTripState,
  ): string | null {
    const matchedKnown = KNOWN_DESTINATIONS.find((d) => d.pattern.test(userMessage));
    const dest = matchedKnown?.canonical || currentTripState.destination;
    if (!dest) return null;

    const daysMatch = userMessage.match(/(\d{1,2})\s*ngày/i);
    const days = daysMatch?.[1]
      ? parseInt(daysMatch[1], 10)
      : currentTripState.durationDays || 2;

    if (dest === 'Vườn Quốc gia Ba Vì') {
      return days <= 1
        ? `**Gợi ý lịch trình tham khảo 1 ngày tại Vườn Quốc gia Ba Vì:**\n- **Sáng:** Xuất phát sớm từ Hà Nội → cổng VQG → dừng chân đồi thông cốt 400m chụp ảnh và nghỉ ngơi.\n- **Trưa:** Ăn trưa mang theo hoặc khu dịch vụ cốt 400m/600m.\n- **Chiều:** Tham quan Nhà thờ cổ rêu phong → lên cốt 1100m (Đền Thượng / Đỉnh Vua nếu còn thời gian) rồi quay về trước tối.`
        : `**Gợi ý lịch trình tham khảo ${days} ngày tại Vườn Quốc gia Ba Vì:**\n- **Ngày 1:** Di chuyển tới Ba Vì → check-in điểm dừng/bãi cắm trại khu cốt 400m → dạo rừng thông, tham quan Nhà thờ cổ rêu phong → tối ăn uống & nghỉ ngơi.\n- **Ngày 2:** Sáng sớm lên khu cốt 1100m săn mây, tham quan Đền Thượng / Đỉnh Vua → ghé vườn xương rồng trước khi xuống núi chiều về.`;
    }

    return `**Gợi ý khung lịch trình tham khảo ${days} ngày tại ${dest}:**\n- **Ngày 1:** Di chuyển đến ${dest}, làm thủ tục vào khu vực tham quan/điểm trại, dạo các điểm chính quanh khu trung tâm và chuẩn bị đồ cho buổi chiều tối.\n- **Ngày ${days}:** Sáng sớm ngắm cảnh/tham quan điểm cao hoặc tuyến phụ phù hợp thể lực rồi thu dọn đồ quay về trong chiều.`;
  }

  private async resolveGeneralOrItineraryAnswer(
    actionType: 'GENERAL_QA' | 'ITINERARY_ADVICE',
    userMessage: string,
    currentTripState: ValidatedTripState,
    modelName: string,
    recentMessages: RecentMessageContext[],
    existingFailureCode?: AiErrorCode,
  ): Promise<{
    answer: string | null;
    qaSource: 'GEMINI' | 'LOCAL_KNOWLEDGE' | 'NONE';
    providerFailureCode?: AiErrorCode;
    providerFailureNote?: string;
  }> {
    if (actionType === 'GENERAL_QA') {
      const localFaq = this.buildLocalGeneralQaAnswer(userMessage);
      if (localFaq) {
        return {
          answer: localFaq,
          qaSource: 'LOCAL_KNOWLEDGE',
        };
      }
    }

    if (!existingFailureCode && (this.customQaGenerator || (!this.customGenerator && this.hasGeminiApiKey()))) {
      const historyLines = recentMessages
        .slice(-6)
        .map(
          (m) =>
            `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${String(m.content || '').slice(0, 220)}`,
        )
        .join('\n');

      const prompt = [
        'Bạn là Trợ lý Du lịch & Dã ngoại TravelShare Việt Nam.',
        actionType === 'ITINERARY_ADVICE'
          ? 'Người dùng đang xin gợi ý lịch trình tham khảo. Hãy trả lời lịch trình ngắn gọn theo buổi/ngày bằng tiếng Việt, thực tế, KHÔNG tự bịa giá vé/giờ mở cửa/thời tiết thời gian thực hôm nay.'
          : 'Người dùng đang hỏi kiến thức chung hoặc cách sử dụng TravelShare. Hãy trả lời tự nhiên, súc tích, thân thiện bằng tiếng Việt như chatbot.',
        historyLines ? `Lịch sử gần đây:\n${historyLines}` : '',
        `Ngữ cảnh chuyến đi đang lưu: ${JSON.stringify(currentTripState)}`,
        `Tin nhắn người dùng: "${userMessage}"`,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const qaText = await this.invokeGeminiWithTimeout(prompt, modelName, {
          step: actionType,
          generatorOverride: this.customQaGenerator,
        });
        const cleaned = (qaText || '').trim();
        if (cleaned) {
          return {
            answer: cleaned,
            qaSource: 'GEMINI',
          };
        }
      } catch (err: any) {
        const classified = this.classifyProviderError(err, modelName);
        this.logger.warn(
          `[AI][step=${actionType}] model=${modelName} code=${classified.code} httpStatus=${classified.httpStatus ?? 500} fallback=LOCAL_OR_RETRY`,
        );
        existingFailureCode = classified.code;
      }
    }

    if (actionType === 'ITINERARY_ADVICE') {
      const localItinerary = this.buildLocalItineraryAdvice(
        userMessage,
        currentTripState,
      );
      if (localItinerary) {
        return {
          answer: localItinerary,
          qaSource: 'LOCAL_KNOWLEDGE',
        };
      }
    }

    if (existingFailureCode) {
      return {
        answer: null,
        qaSource: 'NONE',
        providerFailureCode: existingFailureCode,
        providerFailureNote: this.buildRetryNoticeForCode(
          existingFailureCode,
          modelName,
        ),
      };
    }

    return {
      answer: null,
      qaSource: 'NONE',
    };
  }

  private async resolveDestinationQa(
    fullMessage: string,
    qaQuestion: string,
    subjectDestination: string | null,
    currentTripState: ValidatedTripState,
    modelName: string,
    precomputedGeminiAnswer?: string | null,
    isSpotSuggestionRequest = false,
  ): Promise<{
    answer: string;
    qaSource: 'GEMINI' | 'LOCAL_KNOWLEDGE';
    needsLiveDisclaimer: boolean;
    abortedOnTimeout: boolean;
  }> {
    const asksRealtime =
      /(hôm\s+nay|bây\s+giờ|hiện\s+tại|tuần\s+này|cuối\s+tuần\s+này|giá\s+vé\s+mới|mấy\s+giờ\s+mở|thời\s+tiết\s+hôm|dự\s+báo\s+thời\s+tiết|đường\s+có\s+sạt|có\s+mở\s+cửa\s+không)/i.test(
        qaQuestion,
      );

    if (!subjectDestination) {
      return {
        answer: isSpotSuggestionRequest
          ? 'Bạn muốn mình gợi ý các điểm đến ở khu vực nào (ví dụ: Cát Bà, Ba Vì, Sa Pa...)? Những gợi ý này chỉ để tham khảo và sẽ chưa tự lưu vào kế hoạch cho tới khi bạn chọn.'
          : 'Mình chưa thấy điểm đến nào được nhắc tới trong cuộc hội thoại gần đây. Bạn muốn mình giới thiệu địa điểm nào?',
        qaSource: 'LOCAL_KNOWLEDGE',
        needsLiveDisclaimer: false,
        abortedOnTimeout: false,
      };
    }

    if (precomputedGeminiAnswer && !this.customQaGenerator) {
      const answer = isSpotSuggestionRequest
        ? `${precomputedGeminiAnswer}\n\nℹ️ *Lưu ý:* Các địa điểm trên chỉ là gợi ý tham khảo và **chưa được tự động lưu** vào kế hoạch. Nếu bạn muốn chọn điểm nào làm điểm đến tiếp theo, hãy nhắn rõ nhé.`
        : precomputedGeminiAnswer;
      return {
        answer,
        qaSource: 'GEMINI',
        needsLiveDisclaimer: asksRealtime,
        abortedOnTimeout: false,
      };
    }

    const activeQaGen = this.customQaGenerator;
    if (activeQaGen || (!this.customGenerator && this.hasGeminiApiKey())) {
      const qaPrompt = [
        'Bạn là Trợ lý Du lịch & Cắm trại TravelShare Việt Nam.',
        `Địa điểm đang hỏi (đã chuẩn hóa từ ngữ cảnh nếu người dùng nói "ở đó"): ${subjectDestination}.`,
        `Thông tin chuyến đi hiện tại của người dùng: ${JSON.stringify(currentTripState)}.`,
        `Câu hỏi điểm đến của người dùng: "${qaQuestion}" (từ tin nhắn: "${fullMessage}").`,
        'Yêu cầu trả lời:',
        '1. Trả lời ngắn gọn, tự nhiên, súc tích, đúng trọng tâm bằng tiếng Việt (tối đa 4-5 câu).',
        '2. Tuyệt đối KHÔNG tự bịa số liệu thay đổi theo thời gian (giá vé hôm nay, giờ mở cửa hôm nay, thời tiết hiện tại) khi không có nguồn cập nhật. Nếu người dùng hỏi thông tin thay đổi theo thời gian, hãy nêu rõ bạn chưa có dữ liệu cập nhật trực tiếp và khuyên kiểm tra kênh chính thức.',
      ].join('\n');

      try {
        const qaText = await this.invokeGeminiWithTimeout(qaPrompt, modelName, {
          step: 'DESTINATION_QA',
          generatorOverride: activeQaGen,
        });
        const cleaned = (qaText || '').trim();
        if (cleaned.length > 0) {
          return {
            answer: cleaned,
            qaSource: 'GEMINI',
            needsLiveDisclaimer: asksRealtime,
            abortedOnTimeout: false,
          };
        }
      } catch (err: any) {
        const classified = this.classifyProviderError(err, modelName);
        this.logger.warn(
          `[AI][step=DESTINATION_QA] model=${modelName} code=${classified.code} fallback=LOCAL_KNOWLEDGE`,
        );
        const guide = this.buildLocalDestinationQaAnswer(
          subjectDestination,
          qaQuestion,
          asksRealtime,
          `Không thể kết nối Gemini (${classified.code}) nên dùng thông tin tham khảo tĩnh`,
          isSpotSuggestionRequest,
        );
        return {
          answer: guide,
          qaSource: 'LOCAL_KNOWLEDGE',
          needsLiveDisclaimer: asksRealtime,
          abortedOnTimeout: classified.code === 'TIMEOUT',
        };
      }
    }

    return {
      answer: this.buildLocalDestinationQaAnswer(
        subjectDestination,
        qaQuestion,
        asksRealtime,
        undefined,
        isSpotSuggestionRequest,
      ),
      qaSource: 'LOCAL_KNOWLEDGE',
      needsLiveDisclaimer: asksRealtime,
      abortedOnTimeout: false,
    };
  }

  private buildLocalDestinationQaAnswer(
    destination: string,
    qaQuestion: string,
    asksRealtime: boolean,
    fallbackPrefix?: string,
    isSpotSuggestionRequest = false,
  ): string {
    const spots = TripRequirementParser.SPOT_SUGGESTIONS_VI[destination];
    if (isSpotSuggestionRequest) {
      const parts: string[] = [];
      if (spots && spots.length > 0) {
        parts.push(
          `Một số địa điểm tham khảo nổi bật tại **${destination}**:\n${spots
            .map((s, idx) => `${idx + 1}. ${s}`)
            .join('\n')}`,
        );
      } else {
        const base = TripRequirementParser.DESTINATION_GUIDE_VI[destination];
        parts.push(
          base ||
          `Hiện hệ thống chưa lưu sẵn danh sách điểm tham quan chi tiết tại **${destination}**.`,
        );
      }
      parts.push(
        'ℹ️ *Lưu ý:* Đây là gợi ý tham khảo nên **chưa được tự động lưu** vào kế hoạch chuyến đi. Nếu bạn muốn đổi điểm đến hoặc chốt nơi sẽ đi, hãy nhắn lại để mình cập nhật nhé.',
      );
      if (fallbackPrefix) {
        parts.push(`*Ghi chú kết nối:* ${fallbackPrefix}.`);
      }
      return parts.join('\n\n');
    }

    const baseInfo = TripRequirementParser.DESTINATION_GUIDE_VI[destination];
    const parts: string[] = [];

    if (baseInfo) {
      parts.push(baseInfo);
      if (/nổi\s*bật|có\s*gì\s*(?:hay|chơi|đẹp|đáng)/i.test(qaQuestion)) {
        if (destination === 'Vườn Quốc gia Ba Vì') {
          parts.push(
            'Điểm nổi bật tại Ba Vì gồm săn mây buổi sáng quanh cốt 1100m – Đỉnh Vua, chụp ảnh Nhà thờ cổ phủ rêu, dạo đồi thông cốt 400m và tổ chức dã ngoại/cắm trại dưới tán rừng.',
          );
        } else if (destination === 'Yên Tử') {
          parts.push(
            'Điểm nổi bật tại Yên Tử là hệ thống bậc đá cổ qua rừng trúc, suối Giải Oan, chùa Hoa Yên và chùa Đồng trên đỉnh núi.',
          );
        }
      }
    } else {
      parts.push(
        `Hiện kho thông tin ngoại tuyến chưa có mô tả chi tiết cho **${destination}** và trợ lý chưa kết nối nguồn tra cứu trực tiếp.`,
      );
    }

    if (asksRealtime) {
      const reason =
        fallbackPrefix ||
        'Hệ thống hiện trả lời từ thông tin tham khảo tổng quan, chưa kết nối nguồn cập nhật trực tiếp theo thời gian thực';
      parts.push(
        `⚠️ *Lưu ý:* ${reason} nên chưa có giá vé mới nhất, giờ mở cửa hay dự báo thời tiết hôm nay tại ${destination}. Bạn nên kiểm tra thông báo từ ban quản lý khu du lịch trước khi xuất phát.`,
      );
    } else if (!baseInfo && fallbackPrefix) {
      parts.push(`ℹ️ *Lưu ý:* ${fallbackPrefix}.`);
    }

    return parts.join('\n\n');
  }

  /**
   * Split latest turn into semantic clauses so multi-intent messages
   * (e.g. "Giới thiệu Ba Vì và ghế xếp đã có 2 cáu" or "Ở đó có gì nổi bật? Nhóm đã có 1 lều")
   * classify each part accurately without QA polluting tripState or checklistVersion.
   */
  private analyzeTurnClauses(
    rawText: string,
    currentTripState: ValidatedTripState,
    convContext?: {
      lastMentionedDestination?: string | null;
      pendingOwnedQuestionCode?: string | null;
      pendingDecrementItemCode?: string | null;
      pendingFieldQuestion?: string | null;
    },
  ): {
    planningText: string;
    qaClauses: string[];
    qaSubjectDestination: string | null;
    readChecklistCodes: string[];
    requestChecklistPrint: boolean;
    requestChecklistCreate: boolean;
    requestMissingItemsList: boolean;
    requestRentalGearMatch: boolean;
    requestSavedSpotsRead: boolean;
    requestSpotSuggestions: boolean;
    turnActions: TurnActionType[];
  } {
    const normalizedText = (rawText || '').trim();
    if (!normalizedText) {
      return {
        planningText: '',
        qaClauses: [],
        qaSubjectDestination: null,
        readChecklistCodes: [],
        requestChecklistPrint: false,
        requestChecklistCreate: false,
        requestMissingItemsList: false,
        requestRentalGearMatch: false,
        requestSavedSpotsRead: false,
        requestSpotSuggestions: false,
        turnActions: [],
      };
    }

    const roughSegments = normalizedText
      .split(/(?:\r?\n|(?<!\d)\.(?!\d)|[;?!])+/)
      .flatMap((sent) =>
        sent
          .split(
            /\s*,\s*|\s+(?:nhưng|tuy\s+nhiên)\s+|\s+(?:và|với|còn|nhân tiện|ngoài ra|à)\s+(?=(?:giới\s*thiệu|ở\s*(?:đó|đấy)|nơi\s*(?:đó|đấy)|cho\s*(?:tôi\s*|mình\s*)?(?:biết|xem)|xem\s+|in\s+|tạo\s+checklist|lập\s+checklist|còn\s*thiếu|thiếu\s+(?:mấy|bao\s*nhiêu)|hiện\s*có\s+(?:mấy|bao\s*nhiêu)|thêm\s+|bỏ\s+|xóa\s+|tăng\s+|nhóm\s+(?:đã|cần|thiếu)|đã\s*có|có\s*thêm|bớt\s+|giảm\s+|(?:tôi|mình)\s+muốn|nhóm\s+\d|đi\s+\d|cập\s*nhật|(?:ghế|lều|balo|túi\s*ngủ|giày|gậy|áo\s*(?:mưa|khoác)|đèn|bếp|tấm\s*bạt)[^,;]*?(?:đã\s*có|có\s*thêm|cần|thiếu|bớt|muốn|tăng)))/i,
          )
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .filter(Boolean);

    const planningClauses: string[] = [];
    const qaClauses: string[] = [];
    const readChecklistCodesSet = new Set<string>();
    let requestChecklistPrint = false;
    let requestChecklistCreate = false;
    let requestMissingItemsList = false;
    let requestRentalGearMatch = false;
    let requestSavedSpotsRead = false;
    let requestSpotSuggestions = false;
    let sawSmallTalk = false;
    let sawGeneralQa = false;
    let sawItineraryAdvice = false;
    let qaSubjectDestination: string | null = null;

    const findDestinationInText = (s: string): string | null => {
      for (const item of KNOWN_DESTINATIONS) {
        if (item.pattern.test(s)) return item.canonical;
      }
      return null;
    };

    for (const clause of roughSegments) {
      const lowerClause = clause.toLowerCase().trim();
      if (!lowerClause) continue;

      // 0. Pure greeting / thanks / farewell
      const isSmallTalkClause =
        /^(?:(?:dạ|vâng|ừ|ờ|hi|hey|hello|alo|xin\s*chào|chào(?:\s+(?:bạn|ad|admin|shop|bot|trợ\s*lý|em|anh|chị))?|cảm\s*ơn(?:\s+(?:bạn|nhiều|ad|admin|bot|trợ\s*lý))?|thanks?(?:\s+you)?|ok(?:ie)?(?:\s+(?:bạn|nhé|nha|ạ))?|tạm\s*biệt|bye)(?:\s+(?:bạn|nhé|nha|ạ|nhiều))?)$/i.test(
          lowerClause,
        );
      if (isSmallTalkClause) {
        sawSmallTalk = true;
        continue;
      }

      // 0b. FIND_RENTAL_GEAR ("Tìm thuê đồ đi biển còn thiếu", "Tìm thuê giúp các món còn thiếu")
      const isFindRentalGearClause =
        /(?:tìm\s*(?:thuê|mượn)|kiếm\s*đồ\s*thuê|gợi\s*ý\s*(?:đồ\s*)?thuê|match\s*đồ).*?(?:còn\s*thiếu|đang\s*thiếu|thiếu|trong\s*checklist|cần\s*thuê)|^(?:tìm\s*thuê|thuê\s*giúp|tìm\s*đồ\s*thuê)\b/i.test(
          lowerClause,
        );
      if (isFindRentalGearClause) {
        requestRentalGearMatch = true;
        const hasExtraRentalParams =
          /(?:khu\s*vực|nhận\s*đồ|quận|ngân\s*sách|\d+\s*(?:k|tr|triệu|nghìn|ngàn)|\d{1,2}[/-]\d{1,2}|20\d{2}[/-]\d{1,2}[/-]\d{1,2})/i.test(
            lowerClause,
          );
        if (hasExtraRentalParams) {
          planningClauses.push(clause);
        }
        continue;
      }

      // 0c. SAVED_SPOTS_READ ("Các địa điểm ở Cát Bà mà mình dự định sẽ đi là gì?", "Mình đã chọn những điểm nào?")
      const isSavedSpotsReadClause =
        /(?:địa\s*điểm|điểm(?:\s+đến)?|chỗ|nơi).*?(?:mình|nhóm|đoàn|tôi|ta)?\s*(?:dự\s*định|sẽ\s*đi|đã\s*chọn|đã\s*lưu|đang\s*chốt).*?(?:là\s*gì|nào|chưa|\?$)|(?:mình|nhóm|tôi)\s+đã\s+chọn\s+(?:những\s+)?(?:điểm|địa\s*điểm)\s+nào/i.test(
          lowerClause,
        );
      if (isSavedSpotsReadClause) {
        requestSavedSpotsRead = true;
        const namedDest = findDestinationInText(clause);
        if (namedDest) {
          qaSubjectDestination = namedDest;
        }
        continue;
      }

      // 0d. SUGGEST_SPOTS ("Gợi ý các địa điểm ở Cát Bà", "Ở Cát Bà có những điểm nào đẹp?")
      const isSuggestSpotsClause =
        /(?:gợi\s*ý|đề\s*xuất|có\s+những)\s+(?:các\s+)?(?:địa\s*điểm|điểm\s*(?:tham\s*quan|vui\s*chơi|đẹp|check-?in|du\s*lịch)|chỗ\s*(?:đi|chơi))(?:\s+(?:ở|tại|quanh)\s+[^,.;?!\n]+)?/i.test(
          lowerClause,
        );
      if (isSuggestSpotsClause) {
        requestSpotSuggestions = true;
        qaClauses.push(clause);
        const namedDest = findDestinationInText(clause);
        if (namedDest) {
          qaSubjectDestination = namedDest;
        } else if (!qaSubjectDestination) {
          qaSubjectDestination =
            convContext?.lastMentionedDestination ||
            currentTripState.destination ||
            null;
        }
        continue;
      }

      // 1. Explicit CHECKLIST_VIEW ("xem checklist", "in checklist", "cho xem toàn bộ danh sách")
      const isChecklistView =
        /(xem|in|hiển\s*thị|cho\s*(?:mình\s*|tôi\s*)?xem|liệt\s*kê)\s+(?:toàn\s*bộ\s+|lại\s+)?(?:checklist|danh\s*sách(?:\s*đồ)?)/i.test(
          lowerClause,
        );
      if (isChecklistView) {
        requestChecklistPrint = true;
        continue;
      }

      // 1b. Explicit CHECKLIST_CREATE ("Tạo checklist", "Lập checklist giúp tôi")
      const isChecklistCreate =
        /^(?:hãy\s+)?(?:tạo|lập|lên)\s+(?:giúp\s+(?:mình\s*|tôi\s*)?|ngay\s+)?(?:checklist|danh\s*sách(?:\s*đồ)?)(?:\s+(?:cho\s+(?:chuyến\s*đi|nhóm|tôi|mình)|nhé|đi|nào))?$/i.test(
          lowerClause,
        );
      if (isChecklistCreate) {
        requestChecklistCreate = true;
        continue;
      }

      // 2. Explicit CHECKLIST_ITEM_READ / MISSING_ITEMS_READ
      const mentionedItems = this.findLexiconItemsInSegment(clause);
      const isGeneralMissingRead =
        mentionedItems.length === 0 &&
        /(?:(?:nhóm|mình|đoàn|chúng\s*tôi|chúng\s*mình|checklist)\s+)?(?:hiện\s+)?(?:còn\s+)?thiếu\s+(?:những\s+)?(?:đồ|món|gì|thiết\s*bị|vật\s*dụng)(?:\s+nào|\s+gì|\s+vậy|\s+ạ|\s+nhỉ)?|(?:những|các)\s+(?:đồ|món|thiết\s*bị)\s+(?:nào\s+)?(?:đang\s+|còn\s+)?thiếu/i.test(
          lowerClause,
        ) &&
        !/(?:thuê|mượn)/i.test(lowerClause);

      if (isGeneralMissingRead) {
        requestMissingItemsList = true;
        continue;
      }

      const hasQuestionQtyCue =
        /(?:mấy|bao\s*nhiêu|bnh|còn\s*bao|đủ\s*chưa)/i.test(lowerClause);
      const hasDigitOrNumWordForGear =
        this.parseQuantityFromSegment(clause) !== null;
      const isItemReadQuery =
        mentionedItems.length > 0 &&
        hasQuestionQtyCue &&
        !hasDigitOrNumWordForGear &&
        !/(?:nhóm|mình|đoàn)\s+(?:muốn\s+)?(?:thêm|bỏ|xóa|đổi)/i.test(
          lowerClause,
        );

      if (isItemReadQuery) {
        for (const it of mentionedItems) {
          readChecklistCodesSet.add(it.code);
        }
        continue;
      }

      // 2b. ITINERARY_ADVICE ("Lập lịch trình tham quan Ba Vì 2 ngày")
      const isItineraryRequest =
        /(?:lập|lên|gợi\s*ý|tư\s*vấn|xin|viết|làm)\s+(?:giúp\s+(?:mình\s*|tôi\s*)?)?lịch\s*trình|^lịch\s*trình\b/i.test(
          lowerClause,
        );
      const hasActiveTripDeclaration =
        /(?:tôi|nhóm|đoàn|mình|chúng\s*tôi|chúng\s*mình|bạn)\s+(?:muốn\s+đi|dự\s+định\s+đi|sẽ\s+đi|chốt\s+đi|định\s+đi|lên\s+kế\s+hoạch|cần\s+thuê|muốn\s+thuê)|lập\s+kế\s+hoạch\s+(?:đi|cắm\s*trại|trekking|tham\s*quan)|(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:ngày|người|thành\s*viên)|\b\d{1,2}[/-]\d{1,2}\b|\b(?:ngân\s*sách|triệu|củ|nghìn|ngàn)\b/i.test(
          lowerClause,
        );
      const hasChecklistOpVerb =
        /(?:đã\s*có|có\s*thêm|bớt|giảm|thêm\s+\d|thêm\s+.*\s+vào|bỏ\s+.*\s+khỏi|xóa\s+.*\s+khỏi|nhóm\s+cần|nhóm\s+thiếu|còn\s+thiếu\s+\d|tăng\s+(?:số\s*(?:lượng)?\s*)?.*?(?:lên|thành)|chỉ\s*(?:dùng|cần)|thì\s+có\s+\d|muốn\s+\d+\s*(?:cái|chiếc|lều|balo|ghế))/i.test(
          lowerClause,
        );

      if (isItineraryRequest) {
        sawItineraryAdvice = true;
        if (
          findDestinationInText(clause) ||
          this.textMentionsExplicitActivity(clause) ||
          hasActiveTripDeclaration
        ) {
          planningClauses.push(clause);
        }
        continue;
      }

      // 2c. GENERAL_QA (how-to questions, gear selection/experience, conceptual comparisons)
      const isHowToQuestion =
        /(?:(?:kinh\s*nghiệm|bí\s*quyết|mẹo|lưu\s*ý|cách|làm\s*sao|hướng\s*dẫn)\s+(?:để\s+)?(?:chọn|thêm|bớt|sửa|xóa|tạo|cập\s*nhật|thuê|đặt|dùng|chuẩn\s*bị|chèo|lái|leo|đi|bảo\s*quản)|(?:nên\s+chọn|nên\s+dùng|nên\s+mang)\s+[^?]{2,50}\??$)/i.test(
          lowerClause,
        );
      const isConceptualComparisonQa =
        /(?:khác(?:\s+nhau|\s+với|\s+[^?]{1,40})?\s+(?:thế\s*nào|gì|ra\s*sao|ở\s*điểm\s*nào|như\s*nào)|so\s*sánh|nên\s*chọn\s+.*\s+hay|ưu\s*(?:nhược)?\s*điểm|tại\s*sao|là\s+gì\??$)/i.test(
          lowerClause,
        );
      if (
        (isHowToQuestion || isConceptualComparisonQa) &&
        !hasActiveTripDeclaration &&
        !hasChecklistOpVerb
      ) {
        sawGeneralQa = true;
        continue;
      }

      // 3. Explicit DESTINATION_QA ("Giới thiệu ngắn gọn về Ba Vì", "Ở đó có gì nổi bật?")
      const hasQaPhrase =
        /(?:giới\s*thiệu|tổng\s*quan|review|thông\s*tin\s+về|cho\s*biết\s+về|nói\s*(?:thêm\s+)?về|mô\s*tả|đặc\s*điểm|kinh\s*nghiệm\s+đi|có\s+gì\s+(?:nổi\s*bật|hay|chơi|đẹp|đáng|lưu\s*ý|đặc\s*sắc)|nổi\s*bật\s+(?:gì|nào)|điểm\s+nổi\s*bật|cảnh\s+đẹp|thời\s*tiết|khí\s*hậu|đường\s*đi|bao\s*xa|mất\s*bao\s*lâu|giá\s*vé|vé\s*vào\s*cửa|giờ\s*mở\s*cửa|ở\s*(?:đó|đấy)\s+(?:thế\s*nào|ra\s*sao|có\s*gì))/i.test(
          lowerClause,
        );

      if (hasQaPhrase && !hasActiveTripDeclaration && !hasChecklistOpVerb) {
        qaClauses.push(clause);
        const namedDest = findDestinationInText(clause);
        if (namedDest) {
          qaSubjectDestination = namedDest;
        } else if (
          /(?:ở\s*(?:đó|đấy)|nơi\s*(?:đó|đấy)|chỗ\s*(?:đó|đấy)|địa\s*điểm\s*(?:đó|này)|khu\s*(?:đó|này)|trên\s*(?:đó|đấy))/i.test(
            lowerClause,
          ) ||
          !namedDest
        ) {
          if (!qaSubjectDestination) {
            qaSubjectDestination =
              convContext?.lastMentionedDestination ||
              currentTripState.destination ||
              null;
          }
        }
        continue;
      }

      planningClauses.push(clause);
    }

    const turnActions: TurnActionType[] = [];
    if (
      sawSmallTalk &&
      planningClauses.length === 0 &&
      qaClauses.length === 0 &&
      !requestChecklistPrint &&
      !requestChecklistCreate &&
      !requestMissingItemsList &&
      !requestRentalGearMatch &&
      !requestSavedSpotsRead &&
      !requestSpotSuggestions &&
      readChecklistCodesSet.size === 0 &&
      !sawGeneralQa &&
      !sawItineraryAdvice
    ) {
      turnActions.push('SMALL_TALK');
    }
    if (sawGeneralQa) turnActions.push('GENERAL_QA');
    if (sawItineraryAdvice) turnActions.push('ITINERARY_ADVICE');
    if (requestSpotSuggestions) turnActions.push('SUGGEST_SPOTS');
    if (requestSavedSpotsRead) turnActions.push('SAVED_SPOTS_READ');
    if (requestMissingItemsList) turnActions.push('MISSING_ITEMS_READ');
    if (requestRentalGearMatch) turnActions.push('FIND_RENTAL_GEAR');
    if (qaClauses.length > 0 && !requestSpotSuggestions) {
      turnActions.push('DESTINATION_QA');
    }
    if (readChecklistCodesSet.size > 0) turnActions.push('CHECKLIST_ITEM_READ');
    if (requestChecklistPrint) turnActions.push('CHECKLIST_VIEW');
    if (requestChecklistCreate) turnActions.push('CHECKLIST_CREATE');

    return {
      planningText: planningClauses.join(', '),
      qaClauses,
      qaSubjectDestination,
      readChecklistCodes: Array.from(readChecklistCodesSet),
      requestChecklistPrint,
      requestChecklistCreate,
      requestMissingItemsList,
      requestRentalGearMatch,
      requestSavedSpotsRead,
      requestSpotSuggestions,
      turnActions,
    };
  }

  /**
   * Deterministic Vietnamese NLP extractor for multi-turn TravelShare trip requirements
   */
  extractVietnameseTripPatch(
    rawText: string,
    currentTripState: ValidatedTripState,
    referenceDate?: Date,
    convContext?: {
      lastMentionedDestination?: string | null;
      pendingOwnedQuestionCode?: string | null;
      pendingDecrementItemCode?: string | null;
      pendingFieldQuestion?: string | null;
    },
  ): Omit<ExtractedTripPatch, 'providerMeta'> {
    const analyzed = this.analyzeTurnClauses(
      rawText,
      currentTripState,
      convContext,
    );
    const text = analyzed.planningText.trim();
    const lower = text.toLowerCase();

    const updatedFields: Partial<ValidatedTripState> = {};
    const clearedFields: Array<keyof ValidatedTripState> = [];
    let ownedGearMode: 'ADD' | 'REPLACE' | 'CLEAR' | undefined;
    let ambiguousDateNote: string | null = null;

    if (!text) {
      return {
        updatedFields,
        clearedFields,
        ownedGearMode,
        checklistOperations: [],
        turnActions: analyzed.turnActions,
        qaQuestion:
          analyzed.qaClauses.length > 0 ? analyzed.qaClauses.join('. ') : null,
        qaSubjectDestination: analyzed.qaSubjectDestination,
        readChecklistCodes: analyzed.readChecklistCodes,
        requestChecklistPrint: analyzed.requestChecklistPrint,
        requestChecklistCreate: analyzed.requestChecklistCreate,
        requestMissingItemsList: analyzed.requestMissingItemsList,
        requestRentalGearMatch: analyzed.requestRentalGearMatch,
        requestSavedSpotsRead: analyzed.requestSavedSpotsRead,
        requestSpotSuggestions: analyzed.requestSpotSuggestions,
        ambiguousDateNote: null,
      };
    }

    // 1. Detect explicit clear/delete requests ("xóa ngân sách", "bỏ ngày đi", "chưa chốt ngày", "không có đồ sẵn")
    if (
      /(xóa|bỏ|hủy|chưa\s+chốt|chưa\s+rõ|không\s+cần)\s+(ngày\s+đi|ngày\s+khởi\s+hành|lịch\s+đi)/i.test(
        lower,
      )
    ) {
      clearedFields.push('departureDate', 'endDate');
    }
    if (
      /(xóa|bỏ|hủy|không\s+giới\s+hạn)\s+(ngân\s+sách|chi\s+phí|budget)/i.test(
        lower,
      )
    ) {
      clearedFields.push('budgetVnd');
    }
    if (
      /(xóa|bỏ|hủy)\s+(khu\s+vực\s+nhận|điểm\s+nhận)/i.test(lower)
    ) {
      clearedFields.push('pickupArea');
    }
    if (
      /(xóa|bỏ|hủy)\s+(tuyến\s+đi|cung\s+đường)/i.test(lower)
    ) {
      clearedFields.push('route');
    }
    if (
      /(chưa\s+có\s+đồ\s+gì|không\s+có\s+đồ\s+nào|xóa\s+đồ\s+đã\s+có|bỏ\s+đồ\s+đã\s+có)/i.test(
        lower,
      )
    ) {
      clearedFields.push('ownedGear');
      ownedGearMode = 'CLEAR';
    }

    // 2. Detect Activity, Coastal/Mountain Environment, Overnight & Secondary Activity (explicit only — never default to TREKKING)
    // Strip gear-noun modifiers (e.g. "ghế cắm trại", "gậy trekking") so owning gear never misclassifies the trip's main activity.
    const activityText = lower.replace(
      /(?:ghế|bàn|bếp|đèn|lều|túi\s*ngủ|thảm|bạt|gậy|giày|balo|túi|dép|kính|áo|mũ|váy)\s+(?:cắm\s*trại|camping|trekking|leo\s*núi|đi\s*biển|dã\s*ngoại|phượt)/gi,
      ' ',
    );

    const hasCoastalCue =
      /(?:bãi\s*biển|ở\s*biển|ven\s*biển|ngoài\s*đảo|\bbeach\b|vịnh\s*lan\s*hạ|cô\s*tô|phú\s*quốc|cát\s*bà(?!.*vườn\s*quốc\s*gia))/i.test(
        activityText,
      ) && !/vườn\s*quốc\s*gia/i.test(activityText);

    if (
      /(?:cắm\s*trại|ngủ\s*lều|\bcamping\b).*?(?:bãi\s*biển|ở\s*biển|ven\s*biển|biển)|(?:bãi\s*biển|ở\s*biển).*?(?:cắm\s*trại|ngủ\s*lều|\bcamping\b)|\bbeach\s*camping\b/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.CAMPING;
      updatedFields.environment = 'COASTAL';
    } else if (
      /leo\s*núi\s*(?:kỹ\s*thuật|đỉnh\s*cao|mạo\s*hiểm|bằng\s*dây)|\bmountaineering\b/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.MOUNTAINEERING;
      updatedFields.environment = 'MOUNTAIN';
    } else if (
      /\btrekking\b|\btrek\b|đi\s*bộ\s*(?:đường\s*dài|xuyên\s*rừng|rừng)|leo\s*núi/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.TREKKING;
    } else if (/\bcamping\b|cắm\s*trại|dã\s*ngoại|ngủ\s*lều/i.test(activityText)) {
      updatedFields.activity = ActivityType.CAMPING;
      if (hasCoastalCue) {
        updatedFields.environment = 'COASTAL';
      }
    } else if (
      /phượt\s*xe\s*máy|chạy\s*xe\s*máy|đi\s*xe\s*máy|tour\s*xe\s*máy|\bmotorbike\b/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.MOTORBIKE_TOUR;
    } else if (
      /\bbackpacking\b|du\s*lịch\s*bụi|đi\s*bụi|tự\s*túc\s*nhiều\s*chặng|đi\s*phượt/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.BACKPACKING;
    } else if (
      /đi\s*biển|tắm\s*biển|nghỉ\s*biển|ra\s*biển|du\s*lịch\s*biển|\bbeach\b/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.BEACH;
      updatedFields.environment = 'COASTAL';
    } else if (
      /tham\s*quan|ngắm\s*cảnh|check[-\s]?in|khám\s*phá\s*(?:các\s*)?địa\s*điểm|\bsightseeing\b|du\s*lịch\s*nghỉ\s*dưỡng|nghỉ\s*ngơi/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.SIGHTSEEING;
    } else if (
      /hoạt\s*động\s*khác|chèo\s*(?:sup|kayak|thuyền)|câu\s*cá|team\s*building/i.test(
        activityText,
      )
    ) {
      updatedFields.activity = ActivityType.OTHER;
    }

    if (
      /qua\s*đêm|ngủ\s*lại|ngủ\s*lều|cắm\s*lều\s*đêm|\d+\s*n\s*\d+\s*đ|\b\d+\s*đêm\b|\bovernight\b/i.test(
        lower,
      )
    ) {
      updatedFields.isOvernight = true;
    } else if (/đi\s*về\s*trong\s*ngày|ban\s*ngày/i.test(lower)) {
      updatedFields.isOvernight = false;
    }

    // 3. Detect Destination (explicit change preserves full specific name like "Vườn Quốc gia Cát Bà"; then KNOWN_DESTINATIONS; then coreference "ở đó")
    const explicitDestChangeMatch = text.match(
      /(?:đổi|thay|chuyển|cập\s*nhật|sửa)\s+(?:địa\s*điểm|điểm\s*đến|nơi\s*đi)\s*(?:thành|sang|về|là)\s+([^,.;?!\n]{2,70})/i,
    );
    if (explicitDestChangeMatch?.[1]) {
      const candidateRaw = explicitDestChangeMatch[1]
        .replace(/\s+(?:đi|nhé|nha|ạ|giúp\s+mình|giúp\s+tôi|luôn)$/i, '')
        .trim();
      if (candidateRaw.length >= 2) {
        let resolvedExplicit = candidateRaw;
        for (const item of KNOWN_DESTINATIONS) {
          const match = candidateRaw.match(item.pattern);
          if (match) {
            // Only replace with canonical when canonical is at least as specific as what the user typed
            if (item.canonical.length >= candidateRaw.length - 2) {
              resolvedExplicit = item.canonical;
            }
            break;
          }
        }
        updatedFields.destination = resolvedExplicit;
      }
    }

    // Strip pickup-area phrases ("nhận đồ tại Hải Phòng", "khu vực nhận đồ Cầu Giấy") before destination extraction
    const textForDestination = text.replace(
      /(?:khu\s*vực\s*(?:nhận|lấy)\s*(?:đồ|thiết\s*bị)?|nhận\s+đồ|lấy\s+đồ|thuê\s+đồ)\s*(?:ở|tại|là|:)?\s*[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\p{L}\s,-]{1,40}/giu,
      ' ',
    );

    if (!updatedFields.destination) {
      for (const item of KNOWN_DESTINATIONS) {
        if (item.pattern.test(textForDestination)) {
          updatedFields.destination = item.canonical;
          break;
        }
      }
    }
    if (
      !updatedFields.destination &&
      /(?:muốn\s+đi|đi|chọn|tới|đến|về|lập\s+kế\s+hoạch(?:\s+đi)?)\s+(?:ở\s*(?:đó|đấy)|nơi\s*(?:đó|đấy)|chỗ\s*(?:đó|đấy)|địa\s*điểm\s*(?:đó|này))/i.test(
        lower,
      )
    ) {
      const resolvedDest =
        analyzed.qaSubjectDestination ||
        convContext?.lastMentionedDestination ||
        currentTripState.destination;
      if (resolvedDest) {
        updatedFields.destination = resolvedDest;
      }
    }
    if (!updatedFields.destination) {
      const customDestMatch = textForDestination.match(
        /(?:trekking|camping|cắm\s+trại|tham\s+quan|leo\s+núi|đi\s+phượt|đến|tới|tại)\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\p{L}\s-]{1,40})/u,
      );
      if (customDestMatch?.[1]) {
        const cleaned = customDestMatch[1]
          .replace(
            /\s+(ngày|vào|đi|nhóm|một|hai|ba|bốn|năm|cuối\s+tuần|tháng|cho).*$/i,
            '',
          )
          .trim();
        if (cleaned.length >= 2) {
          updatedFields.destination = cleaned;
        }
      }
    }

    // Update environment when switching explicitly to non-coastal forest/mountain park or coastal spot
    if (updatedFields.destination && !updatedFields.environment) {
      if (/vườn\s*quốc\s*gia/i.test(updatedFields.destination)) {
        updatedFields.environment = 'FOREST';
      } else if (
        /vịnh\s*lan\s*hạ|cô\s*tô|phú\s*quốc/i.test(updatedFields.destination) ||
        (updatedFields.destination === 'Cát Bà' &&
          (updatedFields.activity === ActivityType.BEACH || hasCoastalCue))
      ) {
        updatedFields.environment = 'COASTAL';
      }
    }

    // 4. Detect Intent, Rental desire & Preliminary gear tip requests
    const isPolicyOrSupportQuestion =
      /(chính\s*sách|hoàn\s*tiền|quy\s*định|bảo\s*hiểm|điều\s*khoản|hỗ\s*trợ|ra\s*sao\??$|như\s+thế\s+nào\??$)/i.test(
        lower,
      ) && !/(muốn\s+thuê|cần\s+thuê|tìm\s+đồ\s+thuê|đặt\s+thuê|ngân\s*sách)/i.test(lower);

    const asksPreliminaryGearTip =
      /(?:cần\s*(?:chuẩn\s*bị|mang)(?:\s+theo)?\s+gì|mang\s+gì|đem\s+gì|nên\s+mang\s+gì|chuẩn\s*bị\s+(?:đồ\s+)?gì)/i.test(
        lower,
      );

    if (
      !isPolicyOrSupportQuestion &&
      /(cần\s+thuê|muốn\s+thuê|tìm\s+đồ\s+thuê|thuê\s+đồ|mượn\s+đồ|mượn\s+thêm|\bthuê\b)/i.test(
        lower,
      )
    ) {
      updatedFields.wantsToRent = true;
      if (!currentTripState.intent) {
        updatedFields.intent = 'PREPARE_TRIP';
      }
    } else if (
      updatedFields.destination ||
      updatedFields.activity ||
      /(chuẩn\s+bị|tư\s+vấn|checklist|lên\s+đồ|muốn\s+đi|lập\s+kế\s+hoạch|cần\s+mang\s+gì)/i.test(
        lower,
      )
    ) {
      updatedFields.intent = currentTripState.intent || 'PREPARE_TRIP';
    }

    // 5. Detect Route (tuyến đi)
    const routeMatch = text.match(
      /(?:tuyến|cung\s+đường|đường|đi\s+theo\s+hướng|leo\s+hướng)\s+([^,.;\n]{3,45})/i,
    );
    if (routeMatch?.[1] && !/đường\s+dài/i.test(routeMatch[0])) {
      updatedFields.route = routeMatch[1].trim();
    } else if (/cáp\s*treo/i.test(lower)) {
      updatedFields.route = 'Kết hợp cáp treo';
    } else if (/đường\s*bộ\s*tùng\s*lâm|leo\s*bộ\s*từ\s*chùa\s*giải\s*oan/i.test(lower)) {
      updatedFields.route = 'Leo bộ từ Tùng Lâm - Chùa Giải Oan';
    }

    // 6. Detect Duration (durationDays)
    if (/đi\s+về\s+trong\s+ngày|đi\s+trong\s+ngày/i.test(lower)) {
      updatedFields.durationDays = 1;
    } else {
      const ndMatch = lower.match(/(\d+)\s*n\s*(\d+)\s*đ/i);
      if (ndMatch?.[1]) {
        updatedFields.durationDays = parseInt(ndMatch[1], 10);
      } else {
        const digitDayMatch = lower.match(
          /(?:đi\s+|trong\s+|khoảng\s+)?(\d{1,2})\s*ngày/i,
        );
        if (digitDayMatch?.[1]) {
          const d = parseInt(digitDayMatch[1], 10);
          if (d >= 1 && d <= 60) {
            updatedFields.durationDays = d;
          }
        } else {
          for (const [word, num] of Object.entries(VIETNAMESE_NUMBER_WORDS)) {
            const wordDayRegex = new RegExp(
              `(?:^|[\\s,.;])(?:đi\\s+|trong\\s+|khoảng\\s+)?${word}\\s+ngày(?=$|[\\s,.;?!])`,
              'i',
            );
            if (wordDayRegex.test(lower)) {
              updatedFields.durationDays = num;
              break;
            }
          }
        }
      }
    }

    // 7. Detect Travelers (số người)
    if (/đi\s+một\s+mình|đi\s+1\s+mình|\bsolo\b/i.test(lower)) {
      updatedFields.travelers = 1;
    } else if (/(hai\s+vợ\s+chồng|cặp\s+đôi)/i.test(lower)) {
      updatedFields.travelers = 2;
    } else {
      const digitTravelerMatch = lower.match(
        /(?:nhóm\s+|đoàn\s+|có\s+|gồm\s+|khoảng\s+)?(\d{1,3})\s*(?:người|thành\s*viên|bạn|anh\s*em)/i,
      );
      if (digitTravelerMatch?.[1]) {
        const t = parseInt(digitTravelerMatch[1], 10);
        if (t >= 1 && t <= 200) {
          updatedFields.travelers = t;
        }
      } else {
        for (const [word, num] of Object.entries(VIETNAMESE_NUMBER_WORDS)) {
          const wordTravelerRegex = new RegExp(
            `(?:^|[\\s,.;])(?:nhóm\\s+|đoàn\\s+|có\\s+|gồm\\s+)?${word}\\s+(?:người|thành\\s+viên|bạn|anh\\s+em)(?=$|[\\s,.;?!])`,
            'i',
          );
          if (wordTravelerRegex.test(lower)) {
            updatedFields.travelers = num;
            break;
          }
        }
      }
    }

    // 8. Detect Experience Level
    if (
      /(chưa\s+có\s+kinh\s+nghiệm|mới\s+đi\s+lần\s+đầu|người\s+mới|\bbeginner\b|chưa\s+từng\s+leo)/i.test(
        lower,
      )
    ) {
      updatedFields.experienceLevel = ExperienceLevel.BEGINNER;
    } else if (
      /(đã\s+đi\s+vài\s+lần|có\s+chút\s+kinh\s+nghiệm|trung\s+bình|\bintermediate\b)/i.test(
        lower,
      )
    ) {
      updatedFields.experienceLevel = ExperienceLevel.INTERMEDIATE;
    } else if (
      /(nhiều\s+kinh\s+nghiệm|chuyên\s+nghiệp|leo\s+nhiều\s+đỉnh|\badvanced\b)/i.test(
        lower,
      )
    ) {
      updatedFields.experienceLevel = ExperienceLevel.ADVANCED;
    }

    // 9. Detect Structured Checklist Operations & Owned Gear
    const checklistOperations = !clearedFields.includes('ownedGear')
      ? this.extractChecklistOperations(text)
      : [];

    if (!clearedFields.includes('ownedGear')) {
      const ownedCodesFromOps: string[] = [];
      const ownedQuantitiesFromOps: Record<string, number> = {};

      for (const op of checklistOperations) {
        if (
          op.intent === 'SET_OWNED' ||
          op.intent === 'INCREMENT_OWNED' ||
          op.intent === 'ASK_OWNED_QUANTITY'
        ) {
          ownedCodesFromOps.push(op.categoryCode);
          if (
            op.intent === 'SET_OWNED' &&
            typeof op.quantity === 'number' &&
            op.quantity >= 0
          ) {
            ownedQuantitiesFromOps[op.categoryCode] = op.quantity;
          }
        }
      }

      if (ownedCodesFromOps.length > 0) {
        updatedFields.ownedGear = Array.from(new Set(ownedCodesFromOps));
        ownedGearMode = /(chỉ\s+có|thay\s+đổi\s+đồ\s+đã\s+có)/i.test(lower)
          ? 'REPLACE'
          : 'ADD';
      }

      if (Object.keys(ownedQuantitiesFromOps).length > 0) {
        updatedFields.ownedGearQuantities = ownedQuantitiesFromOps;
      }
    }

    // Guard against gear item names ("lều cắm trại", "gậy trekking", "bếp dã ngoại")
    // accidentally overwriting an existing trip activity during checklist item operations
    if (
      checklistOperations.length > 0 &&
      currentTripState.activity &&
      updatedFields.activity &&
      updatedFields.activity !== currentTripState.activity &&
      !/(?:đi|muốn|đổi\s+sang|chuyển\s+sang|hình\s+thức)\s+(?:trekking|camping|cắm\s+trại|dã\s+ngoại|leo\s+núi)/i.test(
        lower,
      )
    ) {
      delete updatedFields.activity;
    }

    // 10. Detect Budget (ngân sách thuê)
    if (!clearedFields.includes('budgetVnd')) {
      const millionMatch = lower.match(
        /(\d+(?:[.,]\d+)?)\s*(?:triệu|tr|củ)(?=$|[\s,.;?!])/i,
      );
      const trHalfMatch = lower.match(/(\d+)\s*tr\s*(\d+)/i);
      const thousandMatch = lower.match(
        /(\d{2,4})\s*(?:k|nghìn|ngàn)(?=$|[\s,.;?!])/i,
      );
      const fullVndMatch = lower.match(
        /(\d{1,3}(?:[.,]\d{3})+)\s*(?:đồng|vnd|đ|₫)?/i,
      );

      if (trHalfMatch) {
        updatedFields.budgetVnd =
          parseInt(trHalfMatch[1], 10) * 1_000_000 +
          parseInt(trHalfMatch[2], 10) * 100_000;
        updatedFields.wantsToRent = true;
      } else if (millionMatch) {
        const val = parseFloat(millionMatch[1].replace(',', '.'));
        updatedFields.budgetVnd = Math.round(val * 1_000_000);
        updatedFields.wantsToRent = true;
      } else if (fullVndMatch) {
        const digits = fullVndMatch[1].replace(/[.,]/g, '');
        const parsedVnd = parseInt(digits, 10);
        if (parsedVnd >= 10000) {
          updatedFields.budgetVnd = parsedVnd;
          updatedFields.wantsToRent = true;
        }
      } else if (thousandMatch) {
        updatedFields.budgetVnd = parseInt(thousandMatch[1], 10) * 1000;
        updatedFields.wantsToRent = true;
      }
    }

    // 11. Detect Pickup Area (khu vực nhận đồ)
    if (!clearedFields.includes('pickupArea')) {
      const areaMatch = text.match(
        /(?:nhận\s+đồ\s+(?:ở|tại)|khu\s+vực\s+nhận\s+đồ\s*(?:ở|tại|là)?|thuê\s+đồ\s+ở|ở\s+quận)\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\p{L}\s,]{2,35})/u,
      );
      if (areaMatch?.[1]) {
        updatedFields.pickupArea = areaMatch[1]
          .replace(/\s+(nhé|ạ|với|trong).*$/i, '')
          .trim();
      } else {
        const hnDistricts = [
          'Đống Đa',
          'Cầu Giấy',
          'Thanh Xuân',
          'Ba Đình',
          'Hoàn Kiếm',
          'Hai Bà Trưng',
          'Tây Hồ',
          'Long Biên',
          'Nam Từ Liêm',
          'Bắc Từ Liêm',
          'Hà Đông',
        ];
        for (const dist of hnDistricts) {
          if (new RegExp(dist, 'i').test(text)) {
            updatedFields.pickupArea = `${dist}, Hà Nội`;
            break;
          }
        }
      }
    }

    // 12. Detect Departure Date (normalized to Asia/Ho_Chi_Minh) & Ambiguity check
    if (!clearedFields.includes('departureDate')) {
      const dateResult = this.parseVietnamDateFromText(text, referenceDate);
      if (dateResult.isoDate) {
        updatedFields.departureDate = dateResult.isoDate;
      } else if (dateResult.ambiguousNote) {
        ambiguousDateNote = dateResult.ambiguousNote;
      }
    }

    const bareNumericMatch = text.match(/^\s*(\d{1,3})\s*$/);
    if (bareNumericMatch?.[1]) {
      const bareNum = parseInt(bareNumericMatch[1], 10);
      if (convContext?.pendingFieldQuestion === 'travelers' && bareNum >= 1 && bareNum <= 200) {
        updatedFields.travelers = bareNum;
      } else if (convContext?.pendingFieldQuestion === 'durationDays' && bareNum >= 1 && bareNum <= 60) {
        updatedFields.durationDays = bareNum;
      } else if (convContext?.pendingOwnedQuestionCode) {
        const lex = OWNED_GEAR_LEXICON.find(
          (l) => l.code === convContext.pendingOwnedQuestionCode,
        );
        if (lex) {
          checklistOperations.push({
            intent: 'SET_OWNED',
            categoryCode: lex.code,
            itemName: lex.labelVi,
            quantity: bareNum,
            unit: lex.unit,
            rawClause: text,
          });
          updatedFields.ownedGear = [lex.code];
          ownedGearMode = 'ADD';
          updatedFields.ownedGearQuantities = { [lex.code]: bareNum };
        }
      }
    }

    let preliminaryGearSuggestion: string | null = null;
    if (asksPreliminaryGearTip) {
      const tipDest = updatedFields.destination || currentTripState.destination;
      const tipAct = updatedFields.activity || currentTripState.activity;
      const tipEnv = updatedFields.environment || currentTripState.environment;
      if (tipAct === ActivityType.BEACH) {
        preliminaryGearSuggestion =
          'Với chuyến đi biển ban ngày, bạn nên chuẩn bị sơ bộ: đồ bơi, khăn tắm nhanh khô, dép đi biển, kem chống nắng SPF50+, kính râm, túi khô chống nước và nước uống.';
      } else if (tipAct === ActivityType.CAMPING) {
        preliminaryGearSuggestion =
          tipEnv === 'COASTAL'
            ? 'Gợi ý đồ cơ bản cho cắm trại ven biển gồm: lều chống gió có cọc neo cát, tấm bạt/tăng che nắng gió, túi ngủ mỏng & thảm cách ẩm, đèn trại, bếp dã ngoại, kem chống nắng và nước uống.'
            : 'Gợi ý đồ cơ bản cho cắm trại gồm: lều chống mưa, túi ngủ/tấm lót cách nhiệt, đèn pin, ghế xếp, bếp dã ngoại và nước uống.';
      } else if (tipAct === ActivityType.SIGHTSEEING) {
        preliminaryGearSuggestion =
          'Với chuyến tham quan, bạn nên mang theo balo gọn nhẹ, giày đi bộ êm chân, sạc dự phòng, kem chống nắng/mũ nón, áo khoác nhẹ và nước uống.';
      } else if (tipAct === ActivityType.MOTORBIKE_TOUR) {
        preliminaryGearSuggestion =
          'Với phượt xe máy, ưu tiên mũ bảo hiểm 3/4 hoặc Fullface, găng tay bảo hộ, áo mưa bộ, dây ràng hành lý, túi chống nước, bộ vá xe cơ bản và đèn pin.';
      } else if (tipAct === ActivityType.MOUNTAINEERING) {
        preliminaryGearSuggestion =
          'Với leo núi kỹ thuật, cần giày leo núi cổ cao đế bám, gậy leo núi, đèn đội đầu, áo giữ nhiệt/hardshell, găng tay bám đá, túi sơ cứu và nước điện giải.';
      } else if (tipAct === ActivityType.BACKPACKING) {
        preliminaryGearSuggestion =
          'Với du lịch bụi tự túc, bạn nên chuẩn bị balo chính 35L–50L, túi giấy tờ/ổ khóa nhỏ, quần áo nhanh khô, sạc dự phòng, giày bền nhẹ và túi y tế.';
      } else if (tipDest === 'Yên Tử' || tipAct === ActivityType.TREKKING) {
        preliminaryGearSuggestion =
          'Với hành trình leo núi / tham quan địa hình bậc đá như Yên Tử, bạn nên chuẩn bị sơ bộ: giày bám tốt, balo nhẹ 20–30L, nước uống, áo gió/áo mưa mỏng và gậy leo núi nếu đi bộ toàn tuyến.';
      } else {
        preliminaryGearSuggestion =
          'Với chuyến đi tại ' +
          (tipDest || 'điểm đến này') +
          ', nhóm đồ gọn nhẹ cơ bản gồm balo cá nhân, túi y tế cơ bản, sạc dự phòng, áo khoác mỏng/áo mưa dự phòng và nước uống.';
      }
    }

    const turnActions = [...analyzed.turnActions];
    if (checklistOperations.length > 0) {
      turnActions.push('CHECKLIST_MUTATION');
    }
    const hasNonGearTripField =
      Object.keys(updatedFields).some(
        (k) => k !== 'ownedGear' && k !== 'ownedGearQuantities',
      ) || clearedFields.length > 0;
    if (hasNonGearTripField) {
      turnActions.push('TRIP_UPDATE');
    }

    return {
      updatedFields,
      clearedFields,
      ownedGearMode,
      checklistOperations,
      turnActions: Array.from(new Set(turnActions)),
      qaQuestion:
        analyzed.qaClauses.length > 0 ? analyzed.qaClauses.join('. ') : null,
      qaSubjectDestination:
        analyzed.qaSubjectDestination || updatedFields.destination || null,
      readChecklistCodes: analyzed.readChecklistCodes,
      requestChecklistPrint: analyzed.requestChecklistPrint,
      requestChecklistCreate: analyzed.requestChecklistCreate,
      requestMissingItemsList: analyzed.requestMissingItemsList,
      requestRentalGearMatch: analyzed.requestRentalGearMatch,
      requestSavedSpotsRead: analyzed.requestSavedSpotsRead,
      requestSpotSuggestions: analyzed.requestSpotSuggestions,
      preliminaryGearSuggestion,
      ambiguousDateNote,
    };
  }

  /**
   * Extract structured checklist mutation operations from Vietnamese natural language:
   * - SET_OWNED ("Đã có 1 lều", "Ghế xếp đã có 2 cáu")
   * - INCREMENT_OWNED ("Có thêm 1 lều", "Mượn thêm 1 lều")
   * - DECREMENT_OWNED ("Bớt 1 lều đã có", "Giảm 1 lều đã có")
   * - SET_MISSING ("Nhóm thiếu 1 lều", "Còn thiếu 1 lều")
   * - SET_REQUIRED ("Nhóm cần 3 lều", "Cần chuẩn bị 3 lều")
   * - ADD_ITEM ("Thêm 1 tấm bạt vào checklist")
   * - REMOVE_ITEM ("Bỏ ghế xếp khỏi checklist")
   * - AMBIGUOUS_DECREMENT ("Bớt 1 lều" -> without specifying "đã có" vs "cần")
   * - ASK_OWNED_QUANTITY ("Đã có balo" -> without specifying quantity)
   */
  extractChecklistOperations(rawText: string): ParsedChecklistOperation[] {
    if (!rawText || !rawText.trim()) return [];

    // Strip non-gear numeric expressions (dates, budgets, duration days, traveler counts) so their numbers aren't mistaken for gear counts
    const sanitizedText = rawText
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]20\d{2})?\b/gi, ' ')
      .replace(/\b\d+\s*n\s*\d+\s*đ\b/gi, ' ')
      .replace(
        /\b\d+(?:[.,]\d+)*\s*(?:đồng|vnd|đ|₫|k|nghìn|ngàn|triệu|tr|củ)\b/gi,
        ' ',
      )
      .replace(
        /(?:đi\s+|trong\s+|khoảng\s+)?(?:\d{1,2}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:ngày|đêm)/gi,
        ' ',
      )
      .replace(
        /(?:nhóm\s+|đoàn\s+|có\s+|gồm\s+|khoảng\s+)?(?:\d{1,3}|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:người|thành\s*viên|bạn|anh\s*em)/gi,
        ' ',
      );

    const rawClauses = sanitizedText
      .split(/(?:[,;\n?!]|(?<!\d)\.(?!\d)|\s+(?:nhưng|tuy\s+nhiên)\s+)+/i)
      .map((c) => c.trim())
      .filter(Boolean);

    const operations: ParsedChecklistOperation[] = [];

    for (const clause of rawClauses) {
      const lowerClause = clause.toLowerCase();

      // Skip read-only checklist questions ("còn thiếu mấy lều?", "đã có bao nhiêu ghế?")
      if (
        /(?:mấy|bao\s*nhiêu|bnh|đủ\s*chưa)/i.test(lowerClause) &&
        this.parseQuantityFromSegment(clause) === null
      ) {
        continue;
      }

      // Skip how-to / comparison questions ("Cách thêm 1 balo vào checklist?", "Balo trekking khác balo thường thế nào?")
      if (
        /(?:cách|làm\s*sao|hướng\s*dẫn)\s+(?:để\s+)?(?:thêm|bớt|sửa|xóa|tạo|cập\s*nhật)|(?:khác(?:\s+nhau)?\s+(?:thế\s*nào|gì|ra\s*sao)|so\s*sánh)/i.test(
          lowerClause,
        )
      ) {
        continue;
      }

      // 1. Check REMOVE_ITEM: "Bỏ ghế xếp khỏi checklist", "Xóa ghế xếp khỏi danh sách", "Bỏ mục ghế xếp"
      const removeMatch =
        lowerClause.match(
          /(?:bỏ|xóa|loại\s*bỏ|gỡ)\s+(.+?)\s+(?:khỏi|ra\s*khỏi|trong)\s+(?:checklist|danh\s*sách)/i,
        ) ||
        lowerClause.match(/(?:bỏ|xóa)\s+mục\s+(.+)/i);

      if (removeMatch) {
        const matchedItems = this.findLexiconItemsInSegment(clause);
        if (matchedItems.length > 0) {
          for (const item of matchedItems) {
            operations.push({
              intent: 'REMOVE_ITEM',
              categoryCode: item.code,
              itemName: item.labelVi,
              quantity: null,
              unit: item.unit,
              rawClause: clause,
            });
          }
        } else if (removeMatch[1]) {
          const customName = this.cleanCustomItemName(removeMatch[1]);
          if (customName) {
            operations.push({
              intent: 'REMOVE_ITEM',
              categoryCode: this.buildCustomCategoryCode(customName),
              itemName: customName,
              quantity: null,
              rawClause: clause,
            });
          }
        }
        continue;
      }

      // 2. Check ADD / INCREMENT_REQUIRED:
      // - "Thêm 2 balo" / "Thêm 1 tấm bạt" / "Thêm 1 tấm bạt vào checklist" / "Tăng thêm 2 balo"
      const addWithOrWithoutChecklistMatch =
        lowerClause.match(
          /(?:thêm|bổ\s*sung|cho\s*thêm)\s+(.+?)\s+(?:vào|vô|trong)\s+(?:checklist|danh\s*sách)/i,
        ) ||
        (!/(?:có\s+thêm|mượn\s+thêm|tìm\s+thêm|kiếm\s+thêm|mua\s+thêm|bổ\s+sung\s+thêm)/i.test(
          lowerClause,
        )
          ? lowerClause.match(/(?:tăng\s+thêm|thêm|cho\s+thêm|bổ\s+sung)\s+(.+)/i)
          : null);

      if (addWithOrWithoutChecklistMatch) {
        const innerText = addWithOrWithoutChecklistMatch[1];
        const qty = this.parseQuantityFromSegment(innerText) ?? 1;
        const matchedItems = this.findLexiconItemsInSegment(innerText);
        if (matchedItems.length > 0) {
          for (const item of matchedItems) {
            operations.push({
              intent: 'INCREMENT_REQUIRED',
              categoryCode: item.code,
              itemName: item.labelVi,
              quantity: qty,
              unit: item.unit,
              rawClause: clause,
            });
          }
          continue;
        } else if (
          /(?:vào|vô|trong)\s+(?:checklist|danh\s*sách)/i.test(lowerClause)
        ) {
          const customName = this.cleanCustomItemName(innerText);
          if (customName) {
            operations.push({
              intent: 'ADD_ITEM',
              categoryCode: this.buildCustomCategoryCode(customName),
              itemName: customName,
              quantity: qty,
              unit: 'chiếc',
              rawClause: clause,
            });
          }
          continue;
        }
      }

      // Find all gear items mentioned in this clause
      const mentionedItems = this.findLexiconItemsInSegment(clause);
      if (mentionedItems.length === 0) {
        continue;
      }

      // Determine clause-level intent
      let clauseIntent: ChecklistOperationIntent | null = null;

      const hasDecrementWord =
        /(?:^|[\s,.;])(bớt|giảm|trừ)(?:\s+đi)?(?=$|[\s,.;])/i.test(lowerClause);
      const hasOwnedQualifier =
        /(?:đã\s*có|có\s*sẵn|đang\s*có|mang\s*sẵn|đã\s*chuẩn\s*bị)/i.test(
          lowerClause,
        );
      const hasIncrementOwned =
        /(?:có\s+thêm|mượn\s+thêm(?:\s+được)?|tìm\s+thêm(?:\s+được)?|kiếm\s+thêm(?:\s+được)?|mua\s+thêm(?:\s+được)?|bổ\s+sung\s+thêm)/i.test(
          lowerClause,
        );
      const hasMissingWord =
        /(?:còn\s+thiếu|nhóm\s+thiếu|đang\s+thiếu|bị\s+thiếu|(?:^|[\s,.;])thiếu)(?=$|[\s,.;])/i.test(
          lowerClause,
        );
      const hasRequiredWord =
        /(?:nhóm\s+cần|đoàn\s+cần|mình\s+cần|cần\s+chuẩn\s*bị|đổi\s+thành\s+cần|sửa\s+thành\s+cần|(?:^|[\s,.;])cần(?!\s*(?:thuê|mượn|tư\s*vấn|hỏi|bổ\s*sung|thông\s*tin|mang\s+gì))(?=$|[\s,.;])|chỉ\s*(?:dùng|cần|lấy|mang)|tăng\s+(?:số\s*(?:lượng)?\s*)?.*?(?:lên(?:\s+là)?|thành)|(?:muốn|chốt|đặt|giữ|thì\s+có)\s+(?:có\s+|dùng\s+|lấy\s+)?(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười))/i.test(
          lowerClause,
        ) && !/(?:muốn\s+thuê|cần\s+thuê)/i.test(lowerClause);

      if (hasDecrementWord) {
        if (hasOwnedQualifier) {
          clauseIntent = 'DECREMENT_OWNED';
        } else {
          clauseIntent = 'AMBIGUOUS_DECREMENT';
        }
      } else if (hasIncrementOwned) {
        clauseIntent = 'INCREMENT_OWNED';
      } else if (hasMissingWord && !hasOwnedQualifier) {
        clauseIntent = 'SET_MISSING';
      } else if (hasRequiredWord && !hasOwnedQualifier && !hasMissingWord) {
        clauseIntent = 'SET_REQUIRED';
      } else if (hasOwnedQualifier) {
        clauseIntent = 'SET_OWNED';
      }

      if (!clauseIntent) {
        continue;
      }

      // If multiple items are joined by "và" in the same clause (e.g. "đã có balo và áo khoác" or "đã có 1 lều và 2 ghế xếp"),
      // split by "và" so each item gets its own local quantity
      const subSegments =
        mentionedItems.length > 1 && /\bvà\b/i.test(clause)
          ? clause.split(/\bvà\b/i)
          : [clause];

      if (subSegments.length > 1) {
        for (const seg of subSegments) {
          const segItems = this.findLexiconItemsInSegment(seg);
          const segQty = this.parseQuantityFromSegment(seg);
          for (const item of segItems) {
            const effectiveIntent =
              clauseIntent === 'SET_OWNED' && segQty === null
                ? 'ASK_OWNED_QUANTITY'
                : clauseIntent;
            operations.push({
              intent: effectiveIntent,
              categoryCode: item.code,
              itemName: item.labelVi,
              quantity: segQty,
              unit: item.unit,
              rawClause: seg.trim(),
            });
          }
        }
      } else {
        const qty = this.parseQuantityFromSegment(clause);
        for (const item of mentionedItems) {
          const effectiveIntent =
            clauseIntent === 'SET_OWNED' && qty === null
              ? 'ASK_OWNED_QUANTITY'
              : clauseIntent;
          operations.push({
            intent: effectiveIntent,
            categoryCode: item.code,
            itemName: item.labelVi,
            quantity: qty,
            unit: item.unit,
            rawClause: clause,
          });
        }
      }
    }

    return operations;
  }

  private findLexiconItemsInSegment(segment: string) {
    const matched: typeof OWNED_GEAR_LEXICON = [];
    const seen = new Set<string>();
    for (const entry of OWNED_GEAR_LEXICON) {
      if (entry.pattern.test(segment) && !seen.has(entry.code)) {
        seen.add(entry.code);
        matched.push(entry);
      }
    }
    return matched;
  }

  /**
   * Extract integer quantity from a gear clause, supporting both digits ("1 lều", "đã có 2 cáu")
   * and Vietnamese number words ("một lều", "hai cái ghế"), ignoring capacity specs like 30L/50L.
   */
  private parseQuantityFromSegment(segment: string): number | null {
    // Strip capacity/technical tokens like 30L, 50L, PU3000mm, 4K (must end at whitespace/punctuation, not inside "1 lều")
    const cleaned = segment
      .toLowerCase()
      .replace(/\b\d+\s*(?:lít|lit|mm|kg|km|l|m|k)(?=$|[\s,.;?!])/gi, ' ');

    // Match explicit integer (including when followed by unit classifiers or typos like "2 cáu", "2 cai", "1 chiếc")
    const digitMatch = cleaned.match(
      /(?:^|[\s,.;])(\d{1,3})(?:\s*(?:cái|cai|cáu|cau|câu|chiếc|chiec|chiêc|bộ|bo|cặp|cap|đôi|doi|tấm|tam|suất|suat))?(?=$|[\s,.;?!])/i,
    );
    if (digitMatch?.[1] !== undefined) {
      const val = parseInt(digitMatch[1], 10);
      if (!isNaN(val) && val >= 0 && val <= 200) {
        return val;
      }
    }

    for (const [word, num] of Object.entries(VIETNAMESE_NUMBER_WORDS)) {
      const wordRegex = new RegExp(
        `(?:^|[\\s,.;])${word}(?:\\s+(?:cái|cai|cáu|cau|câu|chiếc|chiec|bộ|bo|cặp|cap|đôi|doi|tấm|tam))?(?=$|[\\s,.;?!])`,
        'i',
      );
      if (wordRegex.test(cleaned)) {
        return num;
      }
    }

    return null;
  }

  private cleanCustomItemName(raw: string): string {
    return raw
      .replace(/^\s*(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*/i, '')
      .replace(
        /^\s*(?:cái|cai|cáu|cau|chiếc|chiec|bộ|bo|cặp|cap|đôi|doi|tấm|tam)\s+/i,
        '',
      )
      .replace(/\s+(?:vào|khỏi|trong|ra\s+khỏi)\s*(?:checklist|danh\s+sách).*$/i, '')
      .trim();
  }

  private buildCustomCategoryCode(itemName: string): string {
    const slug = itemName
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    return `CUSTOM_${slug || 'ITEM'}`;
  }

  /**
   * Normalize date expressions in `Asia/Ho_Chi_Minh` timezone and detect ambiguous date expressions
   */
  parseVietnamDateFromText(
    text: string,
    referenceDate = new Date(),
  ): { isoDate: string | null; ambiguousNote: string | null } {
    const lower = text.toLowerCase();

    // Calculate current year/month/day in Asia/Ho_Chi_Minh
    const vnParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(referenceDate)
      .split('-');
    const currentYear = parseInt(vnParts[0], 10);
    const currentMonth = parseInt(vnParts[1], 10);
    const currentDay = parseInt(vnParts[2], 10);

    // Explicit YYYY-MM-DD or YYYY/MM/DD (ISO format)
    const isoDateMatch = lower.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoDateMatch) {
      const y = parseInt(isoDateMatch[1], 10);
      const m = parseInt(isoDateMatch[2], 10);
      const d = parseInt(isoDateMatch[3], 10);
      if (this.isValidCalendarDate(y, m, d)) {
        return {
          isoDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          ambiguousNote: null,
        };
      }
      return {
        isoDate: null,
        ambiguousNote: `Ngày ${d}/${m}/${y} không tồn tại trên lịch. Bạn vui lòng xác nhận lại ngày khởi hành chính xác nhé.`,
      };
    }

    // Explicit DD/MM/YYYY or DD-MM-YYYY
    const fullDateMatch = lower.match(
      /(?:ngày\s+|khởi\s+hành\s+|đi\s+vào\s+)?(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/,
    );
    if (fullDateMatch) {
      const d = parseInt(fullDateMatch[1], 10);
      const m = parseInt(fullDateMatch[2], 10);
      const y = parseInt(fullDateMatch[3], 10);
      if (this.isValidCalendarDate(y, m, d)) {
        return {
          isoDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          ambiguousNote: null,
        };
      }
      return {
        isoDate: null,
        ambiguousNote: `Ngày ${d}/${m}/${y} không tồn tại trên lịch. Bạn vui lòng xác nhận lại ngày khởi hành chính xác nhé.`,
      };
    }

    // DD/MM (without year -> infer current or next year in Asia/Ho_Chi_Minh)
    const shortDateMatch = lower.match(
      /(?:ngày\s+|vào\s+|khởi\s+hành\s+)(\d{1,2})[/-](\d{1,2})(?!\d|[/-])/,
    );
    if (shortDateMatch) {
      const d = parseInt(shortDateMatch[1], 10);
      const m = parseInt(shortDateMatch[2], 10);
      let y = currentYear;
      if (m < currentMonth || (m === currentMonth && d < currentDay)) {
        y = currentYear + 1;
      }
      if (this.isValidCalendarDate(y, m, d)) {
        return {
          isoDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          ambiguousNote: null,
        };
      }
      return {
        isoDate: null,
        ambiguousNote: `Ngày ${d}/${m} không hợp lệ. Bạn vui lòng cho mình biết lại ngày đi cụ thể (DD/MM/YYYY) nhé.`,
      };
    }

    // Relative dates: "ngày mai", "hôm nay"
    if (/ngày\s+mai/i.test(lower)) {
      const tomorrow = new Date(referenceDate.getTime() + 86400000);
      const iso = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(tomorrow);
      return { isoDate: iso, ambiguousNote: null };
    }

    // Ambiguous date phrases ("tháng sau", "tuần sau nữa", "đầu tháng tới")
    if (
      /(tháng\s+sau|đầu\s+tháng\s+tới|cuối\s+tháng\s+sau|khi\s+nào\s+rảnh|vài\s+tuần\s+nữa)/i.test(
        lower,
      )
    ) {
      return {
        isoDate: null,
        ambiguousNote:
          'Thời gian khởi hành bạn nêu còn hơi rộng. Nếu cần kiểm tra lịch thiết bị cho thuê, bạn cho mình biết ngày dự kiến cụ thể (ví dụ: 20/11/2026) nhé!',
      };
    }

    return { isoDate: null, ambiguousNote: null };
  }

  private isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dt = new Date(Date.UTC(year, month - 1, day));
    return (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    );
  }
}
