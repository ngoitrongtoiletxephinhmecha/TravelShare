import {
  Controller,
  Get,
  Post,
  Req,
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
import { Request } from 'express';
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
    summary: 'Upload nhiều ảnh hoặc video (lưu file qua Storage Adapter & metadata vào MongoDB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
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
  ) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:4000';
    const baseUrl = `${protocol}://${host}`;
    return this.mediaService.uploadFiles(user.userId, files, baseUrl);
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái cấu hình Storage Adapter' })
  getStatus() {
    return this.mediaService.getStorageStatus();
  }
}
