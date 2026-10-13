import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountType, UserRole } from '@prisma/client';
import { ACCOUNT_STATUS } from '../auth/auth.constants';
import { UsersService } from './users.service';

function createPrismaMock() {
  const transaction = {
    user: { update: jest.fn() },
    account: { update: jest.fn() },
    session: { deleteMany: jest.fn() },
    deviceToken: { deleteMany: jest.fn() },
    passwordResetCode: { updateMany: jest.fn() },
  };

  return {
    account: { findFirst: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    superadmin: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
    },
    session: { deleteMany: jest.fn() },
    deviceToken: { deleteMany: jest.fn() },
    passwordResetCode: { updateMany: jest.fn() },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    transaction,
  };
}

const mailStub = new Proxy({}, { get: () => jest.fn() }) as never;

describe('UsersService', () => {
  it('merges per-type email switches into the stored opt-outs', async () => {
    const prisma = createPrismaMock();
    const findUnique = jest
      .fn()
      .mockResolvedValue({ email_opt_outs: ['noteAdded', 'ticketReply'] });
    Object.assign(prisma.user, { findUnique });
    const service = new UsersService(prisma as never, mailStub);
    jest.spyOn(service, 'getOwnProfile').mockResolvedValue({} as never);

    await service.updateNotificationPreferences('agent-id', 'AGENT', {
      emailPreferences: { noteAdded: true, meetingReminder: false },
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'agent-id' },
      data: {
        notify_analysis_results: undefined,
        notify_work_updates: undefined,
        email_opt_outs: ['ticketReply', 'meetingReminder'],
      },
    });
  });

  it('rejects management by a non-active superadmin', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      account_type: AccountType.SUPERADMIN,
      superadmin: { status: ACCOUNT_STATUS.PENDING },
    });

    await expect(
      new UsersService(prisma as never, mailStub).listActiveUsers('admin-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks an active managed user and revokes active state', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      status: ACCOUNT_STATUS.ACTIVE,
      role: UserRole.AGENT,
    });

    await expect(
      new UsersService(prisma as never, mailStub).blockUser(
        'admin-id',
        'user-id',
      ),
    ).resolves.toEqual({ updated: true });
    expect(prisma.transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-id' } }),
    );
    expect(prisma.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 'user-id' },
    });
  });

  it('does not block a pending user', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      status: ACCOUNT_STATUS.PENDING,
      role: UserRole.AGENT,
    });

    await expect(
      new UsersService(prisma as never, mailStub).blockUser(
        'admin-id',
        'user-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deletion of a manager with assigned agents', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'manager-id',
      status: ACCOUNT_STATUS.ACTIVE,
      role: UserRole.MANAGER,
    });
    prisma.user.count.mockResolvedValue(1);

    await expect(
      new UsersService(prisma as never, mailStub).deleteUser(
        'admin-id',
        'manager-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft deletes a user instead of removing the account row', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'agent-id',
      status: ACCOUNT_STATUS.ACTIVE,
      role: UserRole.AGENT,
    });

    await expect(
      new UsersService(prisma as never, mailStub).deleteUser(
        'admin-id',
        'agent-id',
      ),
    ).resolves.toEqual({ updated: true });
    expect(prisma.account.delete).not.toHaveBeenCalled();
    expect(prisma.transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-id' },
        data: expect.objectContaining({ status: ACCOUNT_STATUS.DELETED }),
      }),
    );
  });

  it('is a no-op when deleting an already-deleted user', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'agent-id',
      status: ACCOUNT_STATUS.DELETED,
      role: UserRole.AGENT,
    });

    await expect(
      new UsersService(prisma as never, mailStub).deleteUser(
        'admin-id',
        'agent-id',
      ),
    ).resolves.toEqual({ updated: true });
    expect(prisma.transaction.user.update).not.toHaveBeenCalled();
  });

  it('rejects reset requirements for blocked users', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      status: ACCOUNT_STATUS.BLOCKED,
      role: UserRole.AGENT,
    });

    await expect(
      new UsersService(prisma as never, mailStub).requirePasswordReset(
        'admin-id',
        'user-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates a managed user and returns the refreshed profile', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-id',
      status: ACCOUNT_STATUS.ACTIVE,
      role: UserRole.AGENT,
    });
    prisma.account.findUnique.mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'agent@example.com',
        role: UserRole.AGENT,
        first_name: 'Updated',
        last_name: 'Name',
        phone: '123456',
        latest_login: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        password_reset_required: false,
        status: ACCOUNT_STATUS.ACTIVE,
      },
      sessions: [],
    });

    const result = await new UsersService(prisma as never, mailStub).updateUser(
      'admin-id',
      'user-id',
      { firstName: 'Updated', lastName: 'Name', phone: '123456' },
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { first_name: 'Updated', last_name: 'Name', phone: '123456' },
    });
    expect(result.firstName).toBe('Updated');
    expect(result.lastName).toBe('Name');
  });

  it('lets a manager update only their own agent', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'manager-id',
        role: UserRole.MANAGER,
        status: ACCOUNT_STATUS.ACTIVE,
      })
      .mockResolvedValueOnce(null);

    await expect(
      new UsersService(prisma as never, mailStub).updateUser(
        'manager-id',
        'someone-elses-agent-id',
        { firstName: 'Nope' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an explicit not-found error for unsupported account ids', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      new UsersService(prisma as never, mailStub).unblockUser(
        'admin-id',
        'missing-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exports users as a CSV file with a header row', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-id',
        email: 'agent@example.com',
        role: UserRole.AGENT,
        first_name: 'Ada',
        last_name: 'Lovelace',
        phone: null,
        latest_login: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        password_reset_required: false,
        status: ACCOUNT_STATUS.ACTIVE,
        account: { sessions: [] },
      },
    ]);

    const result = await new UsersService(
      prisma as never,
      mailStub,
    ).exportUsers('admin-id', 'csv');

    expect(result.filename).toMatch(/^dme-users-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    const text = result.buffer.toString('utf8');
    expect(text).toContain('Email,First name,Last name');
    expect(text).toContain('agent@example.com,Ada,Lovelace,AGENT,ACTIVE');
  });

  it('exports users as an Excel workbook', async () => {
    const prisma = createPrismaMock();
    prisma.account.findFirst.mockResolvedValue({
      superadmin: { status: ACCOUNT_STATUS.ACTIVE },
    });

    const result = await new UsersService(
      prisma as never,
      mailStub,
    ).exportUsers('admin-id', 'xlsx');

    expect(result.filename).toMatch(/^dme-users-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // The XLSX format is a zip archive, which always starts with this signature.
    expect(result.buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
