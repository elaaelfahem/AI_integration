import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

const MFA_METHODS = ['EMAIL', 'SMS', 'AUTH'] as const;

export class MfaRequestCodeDto {
  @ApiProperty({ description: 'Challenge token returned by /login' })
  @IsString()
  mfaToken: string;

  @ApiProperty({
    enum: MFA_METHODS,
    required: false,
    description:
      'Required the first time a code is requested, when no method has been chosen yet',
  })
  @IsOptional()
  @IsIn(MFA_METHODS)
  method?: (typeof MFA_METHODS)[number];
}

export class MfaVerifyDto {
  @ApiProperty({ description: 'Challenge token returned by /login' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    enum: MFA_METHODS,
    required: false,
    description:
      "Method the code is being verified for. Defaults to the account's current method for backward compatibility.",
  })
  @IsOptional()
  @IsIn(MFA_METHODS)
  method?: (typeof MFA_METHODS)[number];
}
