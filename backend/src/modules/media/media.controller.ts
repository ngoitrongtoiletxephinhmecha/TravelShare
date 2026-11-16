import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as multer from 'multer';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth.decorators';

@ApiTags('Media Upload')
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Upload nhiều ảnh hoặc video (kiểm tra magic bytes, lưu qua Storage Adapter & phân quyền booking nếu có bookingId/scope)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['GENERAL', 'BOOKING_HANDOVER', 'BOOKING_DISPUTE'],
        },
        bookingId: {
          type: 'string',
        },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async uploadMedia(
    @CurrentUser() user: RequestUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
    @Query('scope') queryScope?: string,
    @Query('bookingId') queryBookingId?: string,
    @Body('scope') bodyScope?: string,
    @Body('bookingId') bodyBookingId?: string,
  ) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:4000';
    const baseUrl = `${protocol}://${host}`;
    return this.mediaService.uploadFiles(user.userId, files, baseUrl, {
      scope: bodyScope || queryScope,
      bookingId: bodyBookingId || queryBookingId,
      userRole: user.role,
    });
  }

  @Public()
  @Get('assets/:id')
  @ApiOperation({
    summary:
      'Tải tệp media theo quyền truy cập (công khai hoặc thành viên trực tiếp tham gia booking/admin)',
  })
  async getMediaAsset(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resolved = await this.mediaService.getAuthorizedMediaStreamInfo(
      id,
      user?.userId,
      user?.role,
    );

    res.setHeader(
      'Cache-Control',
      resolved.isPrivate
        ? 'private, no-store, max-age=0'
        : 'public, max-age=86400',
    );
    res.setHeader(
      'Content-Type',
      resolved.asset.mimeType || 'application/octet-stream',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (resolved.remoteUrl) {
      const upstream = await fetch(resolved.remoteUrl);
      if (!upstream.ok) {
        return res.status(upstream.status).send();
      }
      const arrBuf = await upstream.arrayBuffer();
      return new StreamableFile(Buffer.from(arrBuf));
    }

    const stream = fs.createReadStream(resolved.filePath!);
    return new StreamableFile(stream);
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái thực tế của Storage Adapter' })
  getStatus() {
    return this.mediaService.getStorageStatus();
  }
}
