import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import {
  ActivityType,
  ExperienceLevel,
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
  | 'PROVIDER_ERROR';

export class AiProviderException extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
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
  ambiguousDateNote?: string | null;
  assistantHint?: string | null;
  providerMeta: {
    source: 'GEMINI' | 'VIETNAMESE_NLP_PARSER';
    model: string;
    latencyMs: number;
  };
}

export type CustomGeminiGenerator = (prompt: string) => Promise<string>;

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
  { pattern: /ba\s*vì/i, canonical: 'Vườn Quốc gia Ba Vì' },
  { pattern: /cúc\s*phương/i, canonical: 'Vườn Quốc gia Cúc Phương' },
  { pattern: /tà\s*năng\s*[-–]?\s*phan\s*dũng/i, canonical: 'Tà Năng - Phan Dũng' },
  { pattern: /tà\s*năng/i, canonical: 'Tà Năng - Phan Dũng' },
  { pattern: /bidoup/i, canonical: 'Bidoup - Núi Bà' },
  { pattern: /cát\s*bà/i, canonical: 'Cát Bà' },
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
    pattern: /máy\s*ảnh|\bcamera\b|\bgopro\b/i,
    code: 'CAMERA',
    labelVi: 'máy ảnh',
    unit: 'chiếc',
  },
];

export const TRIP_EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
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
        'BEACH_CAMPING',
        'OTHER',
      ],
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

  constructor(private readonly configService: ConfigService) {}

  /**
   * Allow unit/integration tests to inject a mock Gemini generator (to test schema errors, timeouts, quota)
   */
  setCustomGeminiGenerator(generator?: CustomGeminiGenerator) {
    this.customGenerator = generator;
  }

  hasGeminiApiKey(): boolean {
    const key = this.configService.get<string>('gemini.apiKey');
    return Boolean(key && key.trim().length > 5);
  }

  /**
   * Parse user message in Vietnamese into a structured patch (updatedFields + clearedFields)
   */
  async parseUserTurn(
    userMessage: string,
    currentTripState: ValidatedTripState,
    options?: {
      simulateError?: 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'INVALID_SCHEMA';
      referenceDate?: Date;
    },
  ): Promise<ExtractedTripPatch> {
    const startTime = Date.now();
    const modelName =
      this.configService.get<string>('gemini.model') || 'gemini-2.5-flash';

    // Handle explicit error simulation for testing resilience
    if (options?.simulateError === 'TIMEOUT') {
      throw new AiProviderException(
        'TIMEOUT',
        'Yêu cầu phân tích tới Gemini vượt quá thời gian chờ (Timeout). Thông tin chuyến đi của bạn vẫn được giữ nguyên, vui lòng thử lại.',
      );
    }
    if (options?.simulateError === 'QUOTA_EXCEEDED') {
      throw new AiProviderException(
        'QUOTA_EXCEEDED',
        'Hệ thống Gemini tạm thời vượt hạn mức (Quota 429). Trạng thái chuyến đi đã lưu không bị ảnh hưởng, bạn có thể thử gửi lại.',
      );
    }
    if (options?.simulateError === 'INVALID_SCHEMA') {
      throw new AiProviderException(
        'INVALID_SCHEMA',
        'Phản hồi từ mô hình AI không khớp lược đồ dữ liệu (Invalid Schema). Đã giữ nguyên trạng thái hợp lệ trước đó.',
      );
    }

    // 1. Always run deterministic Vietnamese NLP extraction as baseline
    const nlpPatch = this.extractVietnameseTripPatch(
      userMessage,
      currentTripState,
      options?.referenceDate,
    );

    // Fast-path: pure checklist item commands ("nhóm đã có 1 lều", "bỏ ghế xếp", "thêm 1 tấm bạt")
    // are parsed deterministically in <1ms without blocking 15s+ on an external LLM call.
    const hasOnlyChecklistOrOwnedUpdates =
      (nlpPatch.checklistOperations?.length || 0) > 0 &&
      Object.keys(nlpPatch.updatedFields).every(
        (k) => k === 'ownedGear' || k === 'ownedGearQuantities',
      ) &&
      nlpPatch.clearedFields.length === 0;

    if (!this.customGenerator && hasOnlyChecklistOrOwnedUpdates) {
      return {
        ...nlpPatch,
        providerMeta: {
          source: 'VIETNAMESE_NLP_PARSER',
          model: modelName,
          latencyMs: Date.now() - startTime,
        },
      };
    }

    // 2. If customGenerator (test) or GEMINI_API_KEY is present, invoke Gemini Structured Output
    if (this.customGenerator || this.hasGeminiApiKey()) {
      try {
        const rawJsonText = await this.invokeGeminiWithTimeout(
          userMessage,
          currentTripState,
          modelName,
        );
        const geminiPatch = this.validateAndNormalizeGeminiPatch(rawJsonText);

        // Merge Gemini patch with deterministic Vietnamese NLP patch (NLP guarantees exact Vietnamese number/place/checklist accuracy)
        const SafeGeminiUpdated: Partial<ValidatedTripState> = {
          ...geminiPatch.updatedFields,
        };

        // Prevent Gemini from misinterpreting gear item quantities (e.g. "1 lều", "2 cáu", "3 lều") as travelers or durationDays
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

        return {
          updatedFields: mergedUpdated,
          clearedFields: mergedCleared,
          ownedGearMode: nlpPatch.ownedGearMode || geminiPatch.ownedGearMode,
          checklistOperations: nlpPatch.checklistOperations || [],
          ambiguousDateNote:
            nlpPatch.ambiguousDateNote || geminiPatch.ambiguousDateNote,
          providerMeta: {
            source: 'GEMINI',
            model: modelName,
            latencyMs: Date.now() - startTime,
          },
        };
      } catch (err: any) {
        if (err instanceof AiProviderException) {
          // In unit tests with customGenerator (e.g. malformed JSON), propagate INVALID_SCHEMA;
          // for real network TIMEOUT/QUOTA_EXCEEDED, fall back gracefully to Vietnamese NLP parser so chat never stalls with 503.
          if (this.customGenerator || err.code === 'INVALID_SCHEMA') {
            throw err;
          }
          this.logger.warn(
            `Gemini ${err.code} (${err.message}), falling back to Vietnamese NLP parser.`,
          );
        } else {
          const msg = String(err?.message || err);
          if (this.customGenerator && /timeout|timed out|abort/i.test(msg)) {
            throw new AiProviderException(
              'TIMEOUT',
              'Kết nối tới Gemini API quá thời gian chờ (Timeout). Trạng thái chuyến đi đã được bảo toàn.',
            );
          }
          if (
            this.customGenerator &&
            /429|quota|rate limit|resource_exhausted/i.test(msg)
          ) {
            throw new AiProviderException(
              'QUOTA_EXCEEDED',
              'Gemini API tạm thời hết hạn mức (Quota Exceeded). Trạng thái chuyến đi đã được bảo toàn.',
            );
          }
          this.logger.warn(
            `Gemini call failed (${msg}), falling back to Vietnamese NLP parser.`,
          );
        }
      }
    }

    return {
      ...nlpPatch,
      providerMeta: {
        source: 'VIETNAMESE_NLP_PARSER',
        model: modelName,
        latencyMs: Date.now() - startTime,
      },
    };
  }

  private async invokeGeminiWithTimeout(
    userMessage: string,
    currentTripState: ValidatedTripState,
    modelName: string,
  ): Promise<string> {
    const timeoutMs =
      this.configService.get<number>('gemini.timeoutMs') || 15000;

    const prompt = [
      'Bạn là bộ trích xuất yêu cầu chuyến đi (Requirement Parser) của nền tảng TravelShare Việt Nam.',
      'Hãy chỉ trích xuất những trường MỚI xuất hiện hoặc ĐƯỢC SỬA trong tin nhắn mới nhất của người dùng.',
      'Nếu một trường không được nhắc tới trong tin nhắn mới nhất, hãy để null (KHÔNG tự bịa giá trị).',
      'Nếu người dùng yêu cầu xóa/bỏ một thông tin đã nhập (ví dụ: bỏ ngày đi, xóa ngân sách), thêm tên trường vào mảng clearedFields.',
      `Trạng thái hiện tại: ${JSON.stringify(currentTripState)}`,
      `Tin nhắn mới nhất của người dùng: "${userMessage}"`,
    ].join('\n');

    const callPromise = (async () => {
      if (this.customGenerator) {
        return this.customGenerator(prompt);
      }
      const apiKey = this.configService.get<string>('gemini.apiKey')!;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: TRIP_EXTRACTION_RESPONSE_SCHEMA,
        },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new AiProviderException(
            'TIMEOUT',
            `Gemini API không phản hồi sau ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([callPromise, timeoutPromise]);
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
  > {
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
      const validActivities = Object.values(ActivityType) as string[];
      if (!validActivities.includes(parsed.activity)) {
        throw new AiProviderException(
          'INVALID_SCHEMA',
          `Giá trị activity không hợp lệ: ${String(parsed.activity)}`,
        );
      }
      updatedFields.activity = parsed.activity as ActivityType;
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
    };
  }

  /**
   * Deterministic Vietnamese NLP extractor for multi-turn TravelShare trip requirements
   */
  extractVietnameseTripPatch(
    rawText: string,
    currentTripState: ValidatedTripState,
    referenceDate?: Date,
  ): Omit<ExtractedTripPatch, 'providerMeta'> {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    const updatedFields: Partial<ValidatedTripState> = {};
    const clearedFields: Array<keyof ValidatedTripState> = [];
    let ownedGearMode: 'ADD' | 'REPLACE' | 'CLEAR' | undefined;
    let ambiguousDateNote: string | null = null;

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

    // 2. Detect Activity
    if (/cắm\s*trại\s*biển|\bbeach\s*camping\b/i.test(lower)) {
      updatedFields.activity = ActivityType.BEACH_CAMPING;
    } else if (/\btrekking\b|\btrek\b|đi\s*bộ\s*đường\s*dài|leo\s*núi/i.test(lower)) {
      updatedFields.activity = ActivityType.TREKKING;
    } else if (/\bcamping\b|cắm\s*trại|dã\s*ngoại/i.test(lower)) {
      updatedFields.activity = ActivityType.CAMPING;
    } else if (/phượt\s*xe\s*máy|chạy\s*xe\s*máy|\bmotorbike\b/i.test(lower)) {
      updatedFields.activity = ActivityType.MOTORBIKE_TOUR;
    } else if (/\bbackpacking\b|đi\s*phượt/i.test(lower)) {
      updatedFields.activity = ActivityType.BACKPACKING;
    }

    // 3. Detect Destination
    for (const item of KNOWN_DESTINATIONS) {
      if (item.pattern.test(text)) {
        updatedFields.destination = item.canonical;
        break;
      }
    }
    if (!updatedFields.destination) {
      const customDestMatch = text.match(
        /(?:trekking|camping|cắm\s+trại|leo\s+núi|đi\s+phượt|đến|tới|tại)\s+([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\p{L}\s-]{1,30})/u,
      );
      if (customDestMatch?.[1]) {
        const cleaned = customDestMatch[1]
          .replace(
            /\s+(ngày|vào|đi|nhóm|một|hai|ba|bốn|năm|cuối\s+tuần|tháng).*$/i,
            '',
          )
          .trim();
        if (cleaned.length >= 2) {
          updatedFields.destination = cleaned;
        }
      }
    }

    // 4. Detect Intent & Rental desire
    if (/(thuê|mượn|tìm\s+đồ\s+thuê|cần\s+thuê)/i.test(lower)) {
      updatedFields.wantsToRent = true;
      if (!currentTripState.intent) {
        updatedFields.intent = 'PREPARE_TRIP';
      }
    } else if (
      updatedFields.destination ||
      updatedFields.activity ||
      /(chuẩn\s+bị|tư\s+vấn|checklist|lên\s+đồ|muốn\s+đi)/i.test(lower)
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

    return {
      updatedFields,
      clearedFields,
      ownedGearMode,
      checklistOperations,
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
      .split(/[,;\n]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    const operations: ParsedChecklistOperation[] = [];

    for (const clause of rawClauses) {
      const lowerClause = clause.toLowerCase();

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

      // 2. Check ADD_ITEM: "Thêm 1 tấm bạt vào checklist", "Bổ sung 1 tấm bạt vào checklist"
      const addChecklistMatch = lowerClause.match(
        /(?:thêm|bổ\s*sung|cho\s*thêm)\s+(.+?)\s+(?:vào|vô|trong)\s+(?:checklist|danh\s*sách)/i,
      );
      if (addChecklistMatch) {
        const innerText = addChecklistMatch[1];
        const qty = this.parseQuantityFromSegment(innerText) ?? 1;
        const matchedItems = this.findLexiconItemsInSegment(innerText);
        if (matchedItems.length > 0) {
          for (const item of matchedItems) {
            operations.push({
              intent: 'ADD_ITEM',
              categoryCode: item.code,
              itemName: item.labelVi,
              quantity: qty,
              unit: item.unit,
              rawClause: clause,
            });
          }
        } else {
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
        }
        continue;
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
        /(?:nhóm\s+cần|đoàn\s+cần|mình\s+cần|cần\s+chuẩn\s+bị|đổi\s+thành\s+cần|sửa\s+thành\s+cần|(?:^|[\s,.;])cần)(?!\s*(?:thuê|mượn|tư\s*vấn|hỏi|bổ\s*sung|thông\s*tin))(?=$|[\s,.;])/i.test(
          lowerClause,
        );

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
