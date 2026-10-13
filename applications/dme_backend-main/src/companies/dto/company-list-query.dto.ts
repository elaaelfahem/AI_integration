import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListCompaniesQueryDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description:
      'true: companies with at least one completed visit (completed meeting or assignment, or a recorded prospection visit). false: never visited. Agents: visited by them.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  visited?: 'true' | 'false';
}
