import { ApiProperty } from '@nestjs/swagger';
import {
  IsJWT,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetupPasswordDto {
  @ApiProperty({
    description: 'Opaque token returned by /login for a pending account',
  })
  @IsJWT()
  setupToken: string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/\d/, { message: 'Password must contain a number' })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Password must contain a special character',
  })
  password: string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword: string;
}
