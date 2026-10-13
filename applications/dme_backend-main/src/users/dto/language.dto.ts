import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLanguageDto {
  @ApiProperty({
    enum: ['fr', 'en'],
    description: 'Language of the interface, emails and notifications',
  })
  @IsIn(['fr', 'en'])
  language!: 'fr' | 'en';
}
