import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ConfirmEnableMfaDto {
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
