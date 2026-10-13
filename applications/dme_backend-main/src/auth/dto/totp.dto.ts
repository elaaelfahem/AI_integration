import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TotpSetupDto {
  @ApiProperty({ description: 'Challenge token returned by /login' })
  @IsString()
  mfaToken: string;
}

export class TotpConfirmDto {
  @ApiProperty({ description: 'Challenge token returned by /login' })
  @IsString()
  mfaToken: string;

  @ApiProperty({
    example: '123456',
    minLength: 6,
    maxLength: 6,
    description: 'Code currently displayed in the authenticator app',
  })
  @IsString()
  @Length(6, 6)
  code: string;
}
