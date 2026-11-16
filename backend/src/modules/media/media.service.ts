import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  Booking,
  BookingDocument,
  MediaAsset,
  MediaAssetDocument,
} from '../../database/schemas';
import { UserRole } from '../../common/enums/system.enums';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_ATTACHED_EVIDENCE_ITEMS = 10;

export type MediaScope = 'GENERAL' | 'BOOKING_HANDOVER' | 'BOOKING_DISPUTE';
export type MediaVisibility = 'PUBLIC' | 'BOOKING_PARTICIPANTS';

export function detectMediaMagicBytes(
  buffer: Buffer,
): 'IMAGE_JPEG' | 'IMAGE_PNG' | 'IMAGE_GIF' | 'IMAGE_WEBP' | 'VIDEO_MP4_MOV' | 'VIDEO_WEBM' | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'IMAGE_JPEG';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'IMAGE_PNG';
  }
  // GIF: GIF87a or GIF89a
  const head6 = buffer.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') {
    return 'IMAGE_GIF';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'IMAGE_WEBP';
  }
  // MP4 / MOV: ....ftyp
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'VIDEO_MP4_MOV';
  }
  // WEBM: 1A 45 DF A3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'VIDEO_WEBM';
  }

  return null;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly localDir: string;
  private readonly privateDir: string;

  constructor(
    @InjectModel(MediaAsset.name)
    private mediaAssetModel: Model<MediaAssetDocument>,
    private configService: ConfigService,
    @Optional()
    @InjectModel(Booking.name)
    private bookingModel?: Model<BookingDocument>,
  ) {
    this.localDir =
      this.configService.get<string>('storage.localDir') ||
      path.resolve(process.cwd(), 'uploads');
    this.privateDir =
      this.configService.get<string>('storage.privateDir') ||
      path.resolve(process.cwd(), 'private_uploads');

    if (!fs.existsSync(this.localDir)) {
      fs.mkdirSync(this.localDir, { recursive: true });
    }
    if (!fs.existsSync(this.privateDir)) {
      fs.mkdirSync(this.privateDir, { recursive: true });
    }
  }

  resolveStorageAdapter(): {
    configuredDriver: 'local' | 'cloudinary' | 'auto';
    activeDriver: 'local' | 'cloudinary';
    cloudinaryConfigured: boolean;
    misconfigured: boolean;
  } {
    const rawDriver = (
      this.configService.get<string>('storage.driver') || 'auto'
    ).toLowerCase();
    const configuredDriver: 'local' | 'cloudinary' | 'auto' =
      rawDriver === 'cloudinary' || rawDriver === 'local' ? rawDriver : 'auto';

    const cloudName =
      this.configService.get<string>('storage.cloudinaryCloudName') ||
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ||
      '';
    const apiKey =
      this.configService.get<string>('storage.cloudinaryApiKey') ||
      this.configService.get<string>('CLOUDINARY_API_KEY') ||
      '';
    const apiSecret =
      this.configService.get<string>('storage.cloudinaryApiSecret') ||
      this.configService.get<string>('CLOUDINARY_API_SECRET') ||
      '';

    const cloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

    if (configuredDriver === 'cloudinary') {
      return {
        configuredDriver,
        activeDriver: 'cloudinary',
        cloudinaryConfigured,
        misconfigured: !cloudinaryConfigured,
      };
    }

    if (configuredDriver === 'local') {
      return {
        configuredDriver,
        activeDriver: 'local',
        cloudinaryConfigured,
        misconfigured: false,
      };
    }

    return {
      configuredDriver: 'auto',
      activeDriver: cloudinaryConfigured ? 'cloudinary' : 'local',
      cloudinaryConfigured,
      misconfigured: false,
    };
  }

  validateFile(file: Express.Multer.File): 'IMAGE' | 'VIDEO' {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Không tìm thấy dữ liệu file tải lên');
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

    if (!isImage && !isVideo) {
      throw new BadRequestException(
        `Định dạng file "${file.mimetype}" không được hỗ trợ. Chỉ chấp nhận ảnh (JPEG, PNG, WEBP, GIF) hoặc video (MP4, WEBM, MOV).`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES || file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Dung lượng file vượt quá giới hạn cho phép (Tối đa 20MB).`,
      );
    }

    const detected = detectMediaMagicBytes(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Nội dung tệp tải lên không khớp chữ ký ảnh hoặc video hợp lệ',
      );
    }

    const expectedFamily = isImage ? 'IMAGE' : 'VIDEO';
    const detectedFamily = detected.startsWith('IMAGE_') ? 'IMAGE' : 'VIDEO';
    if (expectedFamily !== detectedFamily) {
      throw new BadRequestException(
        `Định dạng khai báo (${file.mimetype}) không khớp với dữ liệu thực tế của tệp`,
      );
    }

    const mimeToExpectedMagic: Record<string, string[]> = {
      'image/jpeg': ['IMAGE_JPEG'],
      'image/jpg': ['IMAGE_JPEG'],
      'image/png': ['IMAGE_PNG'],
      'image/gif': ['IMAGE_GIF'],
      'image/webp': ['IMAGE_WEBP'],
      'video/mp4': ['VIDEO_MP4_MOV'],
      'video/quicktime': ['VIDEO_MP4_MOV'],
      'video/webm': ['VIDEO_WEBM'],
    };
    const allowedMagics = mimeToExpectedMagic[file.mimetype] || [];
    if (!allowedMagics.includes(detected)) {
      throw new BadRequestException(
        `Nội dung nhị phân của tệp không đúng chuẩn ${file.mimetype}`,
      );
    }

    return expectedFamily;
  }

  private async assertCanAccessBookingMedia(
    bookingId: string,
    userId: string,
    userRole?: string,
  ) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Mã giao dịch (bookingId) không hợp lệ');
    }
    if (!this.bookingModel) {
      throw new ServiceUnavailableException(
        'Không thể xác thực quyền truy cập chứng cứ giao dịch',
      );
    }
    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) {
      throw new NotFoundException('Không tìm thấy giao dịch liên quan');
    }

    const isAdmin = userRole === UserRole.ADMIN;
    const isOwner = String(booking.ownerId) === String(userId);
    const isRenter = String(booking.renterId) === String(userId);

    if (!isAdmin && !isOwner && !isRenter) {
      throw new ForbiddenException(
        'Chỉ Chủ thiết bị, Người thuê tham gia giao dịch hoặc Quản trị viên mới được phép thao tác với chứng cứ booking này',
      );
    }
    return booking;
  }

  private async uploadBufferToCloudinary(params: {
    buffer: Buffer;
    mimetype: string;
    originalName: string;
    mediaType: 'IMAGE' | 'VIDEO';
    isPrivate: boolean;
    folderSuffix: string;
  }): Promise<{ secureUrl: string; publicId: string }> {
    const cloudName =
      this.configService.get<string>('storage.cloudinaryCloudName') ||
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ||
      '';
    const apiKey =
      this.configService.get<string>('storage.cloudinaryApiKey') ||
      this.configService.get<string>('CLOUDINARY_API_KEY') ||
      '';
    const apiSecret =
      this.configService.get<string>('storage.cloudinaryApiSecret') ||
      this.configService.get<string>('CLOUDINARY_API_SECRET') ||
      '';
    const rootFolder =
      this.configService.get<string>('storage.cloudinaryFolder') || 'travelshare';

    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Storage Cloudinary chưa được cấu hình đầy đủ API credentials',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${rootFolder}/${params.folderSuffix}`;
    const deliveryType = params.isPrivate ? 'authenticated' : 'upload';
    const resourceType = params.mediaType === 'VIDEO' ? 'video' : 'image';

    const signEntries: Array<[string, string]> = (
      [
        ['folder', folder],
        ['timestamp', String(timestamp)],
        ['type', deliveryType],
      ] as Array<[string, string]>
    ).sort((a, b) => a[0].localeCompare(b[0]));

    const signPayload =
      signEntries.map(([k, v]) => `${k}=${v}`).join('&') + apiSecret;
    const signature = crypto
      .createHash('sha1')
      .update(signPayload)
      .digest('hex');

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(params.buffer)], {
      type: params.mimetype,
    });
    formData.append('file', blob, params.originalName || 'upload');
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('type', deliveryType);
    formData.append('signature', signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(`Cloudinary upload failed (${response.status}): ${errText}`);
      throw new ServiceUnavailableException(
        'Tải tệp lên Cloudinary thất bại. Vui lòng thử lại.',
      );
    }

    const json: any = await response.json();
    return {
      secureUrl: String(json.secure_url || json.url),
      publicId: String(json.public_id),
    };
  }

  async uploadFiles(
    userId: string,
    files: Express.Multer.File[],
    baseUrl: string,
    options?: {
      scope?: string;
      bookingId?: string;
      userRole?: string;
    },
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 ảnh hoặc video');
    }

    const storageInfo = this.resolveStorageAdapter();
    if (storageInfo.misconfigured) {
      throw new ServiceUnavailableException(
        'STORAGE_DRIVER=cloudinary nhưng thiếu cấu hình CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET',
      );
    }

    const rawScope = String(options?.scope || 'GENERAL').toUpperCase();
    const scope: MediaScope =
      rawScope === 'BOOKING_HANDOVER' || rawScope === 'BOOKING_DISPUTE'
        ? rawScope
        : 'GENERAL';

    const bookingId = options?.bookingId?.trim();
    if (scope !== 'GENERAL' && !bookingId) {
      throw new BadRequestException(
        'Upload ảnh bàn giao hoặc tranh chấp bắt buộc phải gắn với bookingId',
      );
    }

    if (bookingId) {
      await this.assertCanAccessBookingMedia(bookingId, userId, options?.userRole);
    }

    const visibility: MediaVisibility = bookingId
      ? 'BOOKING_PARTICIPANTS'
      : 'PUBLIC';
    const effectiveScope: MediaScope =
      bookingId && scope === 'GENERAL' ? 'BOOKING_HANDOVER' : scope;
    const apiPrefix = this.configService.get<string>('apiPrefix') || 'api/v1';

    const results: Array<{
      id: string;
      url: string;
      mediaType: 'IMAGE' | 'VIDEO';
      mimeType: string;
      sizeBytes: number;
      originalName: string;
      storageDriver: 'local' | 'cloudinary';
      visibility: MediaVisibility;
      scope: MediaScope;
      bookingId?: string;
    }> = [];

    for (const file of files) {
      const mediaType = this.validateFile(file);
      const safeOriginal = path.basename(file.originalname || 'file');
      const ext =
        path.extname(safeOriginal).replace(/[^a-zA-Z0-9.]/g, '') ||
        (mediaType === 'IMAGE' ? '.jpg' : '.mp4');
      const safeFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const assetId = new Types.ObjectId();

      let fileUrl = '';
      let publicId = safeFilename;
      let storageKey = safeFilename;

      if (storageInfo.activeDriver === 'cloudinary') {
        const uploaded = await this.uploadBufferToCloudinary({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalName: safeOriginal,
          mediaType,
          isPrivate: visibility === 'BOOKING_PARTICIPANTS',
          folderSuffix:
            visibility === 'BOOKING_PARTICIPANTS'
              ? `bookings/${bookingId}`
              : 'public',
        });
        publicId = uploaded.publicId;
        storageKey = uploaded.secureUrl;
        fileUrl =
          visibility === 'BOOKING_PARTICIPANTS'
            ? `${baseUrl}/${apiPrefix}/media/assets/${String(assetId)}`
            : uploaded.secureUrl;
      } else {
        if (visibility === 'BOOKING_PARTICIPANTS') {
          const bookingPrivateDir = path.join(
            this.privateDir,
            String(bookingId),
          );
          if (!fs.existsSync(bookingPrivateDir)) {
            fs.mkdirSync(bookingPrivateDir, { recursive: true });
          }
          const destPath = path.join(bookingPrivateDir, safeFilename);
          await fs.promises.writeFile(destPath, file.buffer);
          storageKey = path.posix.join(String(bookingId), safeFilename);
          fileUrl = `${baseUrl}/${apiPrefix}/media/assets/${String(assetId)}`;
        } else {
          const destPath = path.join(this.localDir, safeFilename);
          await fs.promises.writeFile(destPath, file.buffer);
          storageKey = safeFilename;
          fileUrl = `${baseUrl}/uploads/${safeFilename}`;
        }
      }

      const asset = await this.mediaAssetModel.create({
        _id: assetId,
        uploaderId: new Types.ObjectId(userId),
        originalName: safeOriginal,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        mediaType,
        storageDriver: storageInfo.activeDriver,
        visibility,
        scope: effectiveScope,
        ...(bookingId ? { bookingId: new Types.ObjectId(bookingId) } : {}),
        url: fileUrl,
        publicId,
        storageKey,
      });

      results.push({
        id: String(asset._id),
        url: asset.url,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        originalName: asset.originalName,
        storageDriver: asset.storageDriver,
        visibility: asset.visibility,
        scope: asset.scope,
        ...(asset.bookingId ? { bookingId: String(asset.bookingId) } : {}),
      });
    }

    return results;
  }

  async isPublicFilenameRestricted(filename: string): Promise<boolean> {
    const cleanName = path.basename(String(filename || '').trim());
    if (!cleanName) return true;
    const asset = await this.mediaAssetModel
      .findOne({ publicId: cleanName })
      .select('visibility')
      .lean();
    return Boolean(asset && asset.visibility === 'BOOKING_PARTICIPANTS');
  }

  async getAuthorizedMediaStreamInfo(
    assetId: string,
    viewerUserId?: string,
    viewerRole?: string,
  ): Promise<{
    asset: any;
    filePath?: string;
    remoteUrl?: string;
    isPrivate: boolean;
  }> {
    if (!Types.ObjectId.isValid(assetId)) {
      throw new NotFoundException('Không tìm thấy tệp media');
    }

    const asset = await this.mediaAssetModel.findById(assetId).lean();
    if (!asset) {
      throw new NotFoundException('Không tìm thấy tệp media');
    }

    const isPrivate = asset.visibility === 'BOOKING_PARTICIPANTS';
    if (isPrivate) {
      if (!viewerUserId) {
        throw new UnauthorizedException(
          'Vui lòng đăng nhập để xem ảnh bàn giao hoặc chứng cứ tranh chấp',
        );
      }
      if (!asset.bookingId) {
        if (
          viewerRole !== UserRole.ADMIN &&
          String(asset.uploaderId) !== String(viewerUserId)
        ) {
          throw new ForbiddenException(
            'Bạn không có quyền xem tài nguyên media riêng tư này',
          );
        }
      } else {
        await this.assertCanAccessBookingMedia(
          String(asset.bookingId),
          viewerUserId,
          viewerRole,
        );
      }
    }

    if (asset.storageDriver === 'cloudinary') {
      return {
        asset,
        remoteUrl: asset.storageKey || asset.url,
        isPrivate,
      };
    }

    const key = asset.storageKey || asset.publicId || '';
    if (!key) {
      throw new NotFoundException('Không tìm thấy đường dẫn lưu trữ tệp');
    }

    const resolvedBase = isPrivate ? this.privateDir : this.localDir;
    const candidatePath = path.resolve(resolvedBase, key);
    if (!candidatePath.startsWith(path.resolve(resolvedBase))) {
      throw new ForbiddenException('Đường dẫn tệp không hợp lệ');
    }

    if (!fs.existsSync(candidatePath)) {
      throw new NotFoundException('Tệp media không còn tồn tại trên máy chủ');
    }

    return {
      asset,
      filePath: candidatePath,
      isPrivate,
    };
  }

  /**
   * Validate media URLs before attaching them to Handover or Dispute records:
   * - Rejects data: / javascript: / blob: or malformed URLs
   * - Enforces booking ownership/participation on internal /media/assets/:id references
   * - Migrates legacy own /uploads/<file> references into private booking-scoped assets
   */
  async validateAndNormalizeBookingEvidenceUrls(params: {
    bookingId: string;
    actorId: string;
    actorRole?: string;
    urls?: string[];
    scope: 'BOOKING_HANDOVER' | 'BOOKING_DISPUTE';
  }): Promise<string[]> {
    const rawList = (params.urls || [])
      .map((u) => String(u || '').trim())
      .filter(Boolean);

    if (rawList.length > MAX_ATTACHED_EVIDENCE_ITEMS) {
      throw new BadRequestException(
        `Chỉ được đính kèm tối đa ${MAX_ATTACHED_EVIDENCE_ITEMS} ảnh/video cho mỗi biên bản hoặc hồ sơ tranh chấp`,
      );
    }

    const normalized: string[] = [];
    const apiPrefix = this.configService.get<string>('apiPrefix') || 'api/v1';

    for (const url of rawList) {
      const lower = url.toLowerCase();
      if (
        lower.startsWith('data:') ||
        lower.startsWith('javascript:') ||
        lower.startsWith('blob:')
      ) {
        throw new BadRequestException(
          'Không chấp nhận chuỗi data URI hoặc URL không hợp lệ trong hồ sơ giao dịch',
        );
      }

      // 1. Internal scoped media endpoint: .../media/assets/:assetId
      const assetMatch = url.match(/\/media\/assets\/([a-f0-9]{24})(?:[?#].*)?$/i);
      if (assetMatch) {
        const assetId = assetMatch[1];
        const asset = await this.mediaAssetModel.findById(assetId);
        if (!asset) {
          throw new BadRequestException(
            'Tệp ảnh/video đính kèm không tồn tại trong hệ thống',
          );
        }
        if (
          asset.bookingId &&
          String(asset.bookingId) !== String(params.bookingId)
        ) {
          throw new ForbiddenException(
            'Không thể tái sử dụng ảnh chứng cứ từ một giao dịch booking khác',
          );
        }
        if (
          !asset.bookingId &&
          params.actorRole !== UserRole.ADMIN &&
          String(asset.uploaderId) !== String(params.actorId)
        ) {
          throw new ForbiddenException(
            'Bạn không có quyền gắn tệp media của người khác vào giao dịch này',
          );
        }

        if (!asset.bookingId) {
          asset.bookingId = new Types.ObjectId(params.bookingId);
          asset.visibility = 'BOOKING_PARTICIPANTS';
          asset.scope = params.scope;
          await asset.save();
        }
        normalized.push(`/${apiPrefix}/media/assets/${String(asset._id)}`);
        continue;
      }

      // 2. Legacy local /uploads/<filename> URLs
      const legacyUploadMatch = url.match(/\/uploads\/([^/?#]+)(?:[?#].*)?$/i);
      if (legacyUploadMatch) {
        const filename = path.basename(decodeURIComponent(legacyUploadMatch[1]));
        const asset = await this.mediaAssetModel.findOne({ publicId: filename });
        if (asset) {
          if (
            asset.bookingId &&
            String(asset.bookingId) !== String(params.bookingId)
          ) {
            throw new ForbiddenException(
              'Không thể sử dụng ảnh chứng cứ thuộc giao dịch khác',
            );
          }
          if (
            params.actorRole !== UserRole.ADMIN &&
            String(asset.uploaderId) !== String(params.actorId)
          ) {
            throw new ForbiddenException(
              'Chỉ người đã tải lên ảnh này mới được gắn vào hồ sơ giao dịch',
            );
          }

          if (asset.storageDriver === 'local') {
            const oldPath = path.join(this.localDir, filename);
            const bookingPrivateDir = path.join(
              this.privateDir,
              String(params.bookingId),
            );
            const newPath = path.join(bookingPrivateDir, filename);
            if (fs.existsSync(oldPath)) {
              if (!fs.existsSync(bookingPrivateDir)) {
                fs.mkdirSync(bookingPrivateDir, { recursive: true });
              }
              await fs.promises.rename(oldPath, newPath);
            }
            asset.storageKey = path.posix.join(String(params.bookingId), filename);
          }

          asset.bookingId = new Types.ObjectId(params.bookingId);
          asset.visibility = 'BOOKING_PARTICIPANTS';
          asset.scope = params.scope;
          asset.url = `/${apiPrefix}/media/assets/${String(asset._id)}`;
          await asset.save();

          normalized.push(asset.url);
          continue;
        }

        // Legacy unindexed file on disk -> migrate into private asset if it physically exists on disk
        const legacyPath = path.join(this.localDir, filename);
        if (fs.existsSync(legacyPath)) {
          const bookingPrivateDir = path.join(
            this.privateDir,
            String(params.bookingId),
          );
          if (!fs.existsSync(bookingPrivateDir)) {
            fs.mkdirSync(bookingPrivateDir, { recursive: true });
          }
          const newPath = path.join(bookingPrivateDir, filename);
          await fs.promises.rename(legacyPath, newPath);
          const stats = await fs.promises.stat(newPath);
          const assetId = new Types.ObjectId();
          const newUrl = `/${apiPrefix}/media/assets/${String(assetId)}`;
          await this.mediaAssetModel.create({
            _id: assetId,
            uploaderId: new Types.ObjectId(params.actorId),
            originalName: filename,
            mimeType: 'image/jpeg',
            sizeBytes: Math.max(1, stats.size),
            mediaType: 'IMAGE',
            storageDriver: 'local',
            visibility: 'BOOKING_PARTICIPANTS',
            scope: params.scope,
            bookingId: new Types.ObjectId(params.bookingId),
            url: newUrl,
            publicId: filename,
            storageKey: path.posix.join(String(params.bookingId), filename),
          });
          normalized.push(newUrl);
          continue;
        }

        throw new BadRequestException(
          `Ảnh local "${filename}" không tồn tại hoặc không hợp lệ để gắn vào giao dịch`,
        );
      }

      // 3. External URLs must be HTTPS
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new BadRequestException(`Đường dẫn media không hợp lệ: ${url}`);
      }

      if (parsed.protocol !== 'https:') {
        throw new BadRequestException(
          'Ảnh bên ngoài gắn vào hồ sơ giao dịch phải sử dụng HTTPS hoặc được upload qua hệ thống media',
        );
      }
      normalized.push(url);
    }

    return Array.from(new Set(normalized));
  }

  getStorageStatus() {
    const adapter = this.resolveStorageAdapter();

    return {
      activeDriver: adapter.activeDriver,
      configuredDriver: adapter.configuredDriver,
      misconfigured: adapter.misconfigured,
      cloudinaryConfigured: adapter.cloudinaryConfigured,
      durable:
        adapter.activeDriver === 'cloudinary'
          ? adapter.cloudinaryConfigured
          : fs.existsSync(this.localDir) && fs.existsSync(this.privateDir),
      localUploadDir: path.basename(this.localDir),
      privateUploadDir: path.basename(this.privateDir),
      legacyUploadsPolicy:
        'Public /uploads/* stays readable across restarts; private booking/dispute assets require /api/v1/media/assets/:id authorization',
      maxFileSizeMb: 20,
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
    };
  }
}
