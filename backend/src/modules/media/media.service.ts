import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MediaAsset, MediaAssetDocument } from '../../database/schemas';

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

@Injectable()
export class MediaService {
  private readonly uploadDir: string;

  constructor(
    @InjectModel(MediaAsset.name)
    private mediaAssetModel: Model<MediaAssetDocument>,
    private configService: ConfigService,
  ) {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file tải lên');
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

    if (!isImage && !isVideo) {
      throw new BadRequestException(
        `Định dạng file "${file.mimetype}" không được hỗ trợ. Chỉ chấp nhận ảnh (JPEG, PNG, WEBP, GIF) hoặc video (MP4, WEBM, MOV).`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Dung lượng file vượt quá giới hạn cho phép (Tối đa 20MB).`,
      );
    }

    return isImage ? ('IMAGE' as const) : ('VIDEO' as const);
  }

  async uploadFiles(
    userId: string,
    files: Express.Multer.File[],
    baseUrl: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 ảnh hoặc video');
    }

    const results: Array<{
      id: string;
      url: string;
      mediaType: 'IMAGE' | 'VIDEO';
      mimeType: string;
      sizeBytes: number;
      originalName: string;
      storageDriver: 'local' | 'cloudinary';
    }> = [];
    for (const file of files) {
      const mediaType = this.validateFile(file);
      const ext = path.extname(file.originalname) || (mediaType === 'IMAGE' ? '.jpg' : '.mp4');
      const safeFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const filePath = path.join(this.uploadDir, safeFilename);

      await fs.promises.writeFile(filePath, file.buffer);

      const fileUrl = `${baseUrl}/uploads/${safeFilename}`;

      const asset = await this.mediaAssetModel.create({
        uploaderId: new Types.ObjectId(userId),
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        mediaType,
        storageDriver: 'local',
        url: fileUrl,
        publicId: safeFilename,
      });

      results.push({
        id: String(asset._id),
        url: asset.url,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        originalName: asset.originalName,
        storageDriver: asset.storageDriver,
      });
    }

    return results;
  }

  getStorageStatus() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    const cloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

    return {
      activeDriver: cloudinaryConfigured ? 'cloudinary' : 'local',
      cloudinaryConfigured,
      maxFileSizeMb: 20,
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
    };
  }
}
