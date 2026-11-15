import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'minh.trekking@travelshare.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  email: string;

  @ApiProperty({ example: 'TravelShare@2026' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu cần chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số',
  })
  password: string;

  @ApiProperty({ example: 'Nguyễn Quang Minh' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên là bắt buộc' })
  @MaxLength(80)
  fullName: string;

  @ApiPropertyOptional({ example: 'minh_trekking' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'Username chỉ bao gồm chữ cái, số và dấu gạch dưới (3-30 ký tự)',
  })
  username?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'minh.trekking@travelshare.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'TravelShare@2026' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  password: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token nếu không dùng HttpOnly Cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'minh.trekking@travelshare.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'minh.trekking@travelshare.vn' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ example: 'NewTravelShare@2026' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu mới cần chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số',
  })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu mới cần chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số',
  })
  newPassword: string;
}
