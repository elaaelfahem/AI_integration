import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisableMfaDto {
  @ApiProperty({ description: "The caller's current password" })
  @IsString()
  password!: string;
}
