import { UnauthorizedException } from '@nestjs/common';
import { AccountType, TokenType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ACCOUNT_STATUS } from '../auth/auth.constants';

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { InvitationsService } from './invitations.service';

describe('InvitationsService', () => {
  const inviterId = '11111111-1111-4111-8111-111111111111';
  const accountId = '22222222-2222-4222-8222-222222222222';
  const tokenId = '33333333-3333-4333-8333-333333333333';
  let prisma: {
    account: { findFirst: jest.Mock; create: jest.Mock };
    user: { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    superadmin: { findFirst: jest.Mock };
    inviteToken: { findFirst: jest.Mock; create: jest.Mock };
    token: { create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailService: { sendInvitation: jest.Mock };
  let authService: { issuePasswordSetupToken: jest.Mock };
  let service: InvitationsService;

  beforeEach(() => {
    mailService = { sendInvitation: jest.fn() };
    authService = {
      issuePasswordSetupToken: jest.fn().mockResolvedValue('setup-token'),
    };
    prisma = {
      account: {
        findFirst: jest.fn().mockResolvedValue({
          id: inviterId,
          account_type: AccountType.SUPERADMIN,
          superadmin: { status: ACCOUNT_STATUS.ACTIVE },
        }),
        create: jest.fn().mockResolvedValue({ id: accountId }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      superadmin: { findFirst: jest.fn().mockResolvedValue(null) },
      inviteToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      token: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof prisma) => unknown) =>
          callback(prisma),
      ),
    };
    service = new InvitationsService(
      prisma as never,
      mailService as never,
      authService as never,
      {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:3000';
            if (key === 'EMAIL_DOMAIN_WHITELIST') return '*';
            return defaultValue;
          }),
      } as never,
    );
  });

  it('rejects invitations from inactive superadmins', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: inviterId,
      account_type: AccountType.SUPERADMIN,
      superadmin: { status: ACCOUNT_STATUS.PENDING },
    });

    await expect(
      service.inviteManager(inviterId, {
        email: 'manager@example.com',
        firstName: 'Amina',
        lastName: 'Manager',
        role: UserRole.MANAGER,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mailService.sendInvitation).not.toHaveBeenCalled();
  });

  it('sends before persisting and creates a pending manager', async () => {
    await service.inviteManager(inviterId, {
      email: 'Manager@Example.com',
      firstName: ' Amina ',
      lastName: ' Manager ',
      role: UserRole.MANAGER,
    });

    expect(mailService.sendInvitation).toHaveBeenCalledTimes(1);
    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        invite_token: {
          is: {
            invited_email: {
              equals: 'manager@example.com',
              mode: 'insensitive',
            },
          },
        },
      },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ account_type: AccountType.USER }),
      }),
    );
    expect(prisma.token.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ token_type: TokenType.INVITE }),
      }),
    );
    expect(prisma.inviteToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          account_id: accountId,
          invited_by_id: inviterId,
          role_to_assign: UserRole.MANAGER,
          invited_email: 'manager@example.com',
        }),
      }),
    );
  });

  it('rejects a superadmin inviting an agent without a manager', async () => {
    await expect(
      service.inviteManager(inviterId, {
        email: 'agent@example.com',
        firstName: 'John',
        lastName: 'Agent',
        role: UserRole.AGENT,
      }),
    ).rejects.toThrow('A manager must be selected for this agent');
    expect(mailService.sendInvitation).not.toHaveBeenCalled();
  });

  it('rejects a superadmin inviting an agent with an unknown manager', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.inviteManager(inviterId, {
        email: 'agent@example.com',
        firstName: 'John',
        lastName: 'Agent',
        role: UserRole.AGENT,
        managerId: 'missing-manager-id',
      }),
    ).rejects.toThrow('Selected manager was not found');
  });

  it('assigns the selected manager when a superadmin invites an agent', async () => {
    const managerId = '44444444-4444-4444-8444-444444444444';
    // First call resolves the selected manager; subsequent calls (the
    // existing-user lookup) fall back to the default null from beforeEach.
    prisma.user.findFirst.mockResolvedValueOnce({
      id: managerId,
      role: UserRole.MANAGER,
      status: ACCOUNT_STATUS.ACTIVE,
    });

    await service.inviteManager(inviterId, {
      email: 'agent@example.com',
      firstName: 'John',
      lastName: 'Agent',
      role: UserRole.AGENT,
      managerId,
    });

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: expect.objectContaining({
            create: expect.objectContaining({ manager_id: managerId }),
          }),
        }),
      }),
    );
  });

  it('does not persist an invitation when email delivery fails', async () => {
    mailService.sendInvitation.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(
      service.inviteManager(inviterId, {
        email: 'manager@example.com',
        firstName: 'Amina',
        lastName: 'Manager',
        role: UserRole.MANAGER,
      }),
    ).rejects.toThrow('SMTP unavailable');
    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        invite_token: {
          is: {
            invited_email: {
              equals: 'manager@example.com',
              mode: 'insensitive',
            },
          },
        },
      },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invitations when email domain is not in the configured whitelist', async () => {
    service = new InvitationsService(
      prisma as never,
      mailService as never,
      authService as never,
      {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            if (key === 'EMAIL_DOMAIN_WHITELIST')
              return '@orange.com,@orange.tn';
            if (key === 'FRONTEND_URL') return 'http://localhost:3000';
            return defaultValue;
          }),
      } as never,
    );

    await expect(
      service.inviteManager(inviterId, {
        email: 'unauthorized@gmail.com',
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.MANAGER,
      }),
    ).rejects.toThrow("L'adresse e-mail doit appartenir à un domaine autorisé");
  });

  it('resends a pending manager invitation and invalidates old open tokens', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: accountId,
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      status: ACCOUNT_STATUS.PENDING,
    });

    await service.resendManagerInvitation(inviterId, accountId);

    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        invite_token: {
          is: {
            invited_email: {
              equals: 'manager@example.com',
              mode: 'insensitive',
            },
          },
        },
      },
      data: { used_at: expect.any(Date) },
    });
    expect(mailService.sendInvitation).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: accountId },
      data: { password_hash: expect.any(String) },
    });
    expect(prisma.token.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token_type: TokenType.INVITE,
        token_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    });
    expect(prisma.inviteToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        account_id: accountId,
        invited_by_id: inviterId,
        invited_email: 'manager@example.com',
        role_to_assign: UserRole.MANAGER,
      }),
    });
  });

  it('does not change an invitation resend when email delivery fails', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: accountId,
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      status: ACCOUNT_STATUS.PENDING,
    });
    mailService.sendInvitation.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(
      service.resendManagerInvitation(inviterId, accountId),
    ).rejects.toThrow('SMTP unavailable');
    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        invite_token: {
          is: {
            invited_email: {
              equals: 'manager@example.com',
              mode: 'insensitive',
            },
          },
        },
      },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('cancels an open manager invitation without deleting it', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: accountId,
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      status: ACCOUNT_STATUS.PENDING,
    });

    await expect(
      service.cancelManagerInvitation(inviterId, accountId),
    ).resolves.toEqual({ cancelled: true });
    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        expires_at: { gt: expect.any(Date) },
        created_at: { gt: expect.any(Date) },
        invite_token: { is: { account_id: accountId } },
      },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.inviteToken.create).not.toHaveBeenCalled();
  });

  it('requires the temporary password and invalidates after three failed attempts', async () => {
    const passwordHash = await bcrypt.hash('TemporaryPassword123!', 4);
    const invitation = {
      id: tokenId,
      attempts: 3,
      token: {
        used_at: null,
        expires_at: new Date(Date.now() + 60_000),
        token_hash: 'hash',
      },
      account: {
        id: accountId,
        user: {
          role: UserRole.MANAGER,
          status: ACCOUNT_STATUS.PENDING,
          password_hash: passwordHash,
          email: 'manager@example.com',
          first_name: 'Amina',
        },
      },
    };
    prisma.inviteToken.findFirst.mockResolvedValue(invitation);

    await expect(
      service.verifyInvitation({
        token: 'raw-token',
        password: 'TemporaryPassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.issuePasswordSetupToken).not.toHaveBeenCalled();
  });

  it('checks a valid invitation before showing the password field', async () => {
    const passwordHash = await bcrypt.hash('TemporaryPassword123!', 4);
    prisma.inviteToken.findFirst.mockResolvedValue({
      id: tokenId,
      attempts: 0,
      token: {
        used_at: null,
        expires_at: new Date('2099-08-03T13:00:00.000Z'),
      },
      account: {
        id: accountId,
        user: {
          role: UserRole.MANAGER,
          status: ACCOUNT_STATUS.PENDING,
          password_hash: passwordHash,
          email: 'manager@example.com',
          first_name: 'Amina',
        },
      },
    });

    await expect(
      service.checkInvitation({ token: ' raw-token ' }),
    ).resolves.toEqual({
      valid: true,
      email: 'manager@example.com',
      firstName: 'Amina',
      role: UserRole.MANAGER,
      expiresAt: '2099-08-03T13:00:00.000Z',
    });
  });

  it('returns the setup token for a valid invitation', async () => {
    const passwordHash = await bcrypt.hash('TemporaryPassword123!', 4);
    prisma.inviteToken.findFirst.mockResolvedValue({
      id: tokenId,
      attempts: 0,
      token: { used_at: null, expires_at: new Date(Date.now() + 60_000) },
      account: {
        id: accountId,
        user: {
          role: UserRole.MANAGER,
          status: ACCOUNT_STATUS.PENDING,
          password_hash: passwordHash,
          email: 'manager@example.com',
          first_name: 'Amina',
        },
      },
    });

    await expect(
      service.verifyInvitation({
        token: 'raw-token',
        password: ' TemporaryPassword123! ',
      }),
    ).resolves.toEqual({
      setupToken: 'setup-token',
      email: 'manager@example.com',
      firstName: 'Amina',
    });
  });

  it('lists managers and returns EXPIRED when token creation time surpasses TTL', async () => {
    const activeCreatedAt = new Date();
    const expiredCreatedAt = new Date(Date.now() - 20 * 60 * 1000);

    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'active@example.com',
        status: ACCOUNT_STATUS.PENDING,
        first_name: 'Active',
        last_name: 'Manager',
        role: UserRole.MANAGER,
        created_at: new Date('2026-08-01T10:00:00Z'),
        account: {
          invites_received: [
            {
              token: {
                used_at: null,
                created_at: activeCreatedAt,
                expires_at: new Date(Date.now() + 10 * 60 * 1000),
              },
            },
          ],
        },
      },
      {
        id: 'user-2',
        email: 'expired@example.com',
        status: ACCOUNT_STATUS.PENDING,
        first_name: 'Expired',
        last_name: 'Manager',
        role: UserRole.AGENT,
        created_at: new Date('2026-08-01T09:00:00Z'),
        account: {
          invites_received: [
            {
              token: {
                used_at: null,
                created_at: expiredCreatedAt,
                expires_at: new Date(Date.now() - 5 * 60 * 1000),
              },
            },
          ],
        },
      },
      {
        id: 'user-3',
        email: 'cancelled@example.com',
        status: ACCOUNT_STATUS.PENDING,
        first_name: 'Cancelled',
        last_name: 'Manager',
        role: UserRole.MANAGER,
        created_at: new Date('2026-08-01T08:00:00Z'),
        account: {
          invites_received: [
            {
              token: {
                used_at: new Date(),
                created_at: expiredCreatedAt,
                expires_at: new Date(Date.now() + 10 * 60 * 1000),
              },
            },
          ],
        },
      },
    ]);

    const result = await service.listManagers();
    expect(result).toEqual([
      expect.objectContaining({
        email: 'active@example.com',
        invitationStatus: 'INVITED',
      }),
      expect.objectContaining({
        email: 'expired@example.com',
        invitationStatus: 'EXPIRED',
      }),
      expect.objectContaining({
        email: 'cancelled@example.com',
        invitationStatus: 'CANCELLED',
      }),
    ]);
  });
});
