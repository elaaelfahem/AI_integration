import { ApiProperty } from '@nestjs/swagger';

export class ManagerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'BLOCKED'] })
  status: string;

  @ApiProperty({
    enum: ['INVITED', 'PENDING', 'ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED'],
  })
  invitationStatus: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ enum: ['MANAGER', 'AGENT'] })
  role: 'MANAGER' | 'AGENT';

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class InvitationAcceptedDto {
  @ApiProperty({ description: 'Opaque password setup token' })
  setupToken: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;
}

export class InvitationCheckDto {
  @ApiProperty()
  valid: true;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty({ enum: ['MANAGER', 'AGENT'] })
  role: 'MANAGER' | 'AGENT';

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class InvitationSentDto {
  @ApiProperty({ example: true })
  sent: true;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class InvitationCancelledDto {
  @ApiProperty({ example: true })
  cancelled: true;
}
