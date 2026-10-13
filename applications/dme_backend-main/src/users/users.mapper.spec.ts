import { UserRole, UserStatus } from '@prisma/client';
import { mapSuperadminView, mapUserView } from './users.mapper';

describe('users mappers', () => {
  it('maps user data and marks a recently touched session online', () => {
    const now = new Date();
    const result = mapUserView({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.AGENT,
      first_name: 'A',
      last_name: 'User',
      phone: null,
      latest_login: null,
      created_at: now,
      password_reset_required: true,
      status: UserStatus.ACTIVE,
      account: { sessions: [{ last_active: now }] },
    });

    expect(result).toMatchObject({
      id: 'user-id',
      role: UserRole.AGENT,
      isOnline: true,
      passwordResetRequired: true,
    });
  });

  it('maps the assigned manager to a display name, or null if unassigned', () => {
    const now = new Date();
    const withManager = mapUserView({
      id: 'agent-id',
      email: 'agent@example.com',
      role: UserRole.AGENT,
      first_name: 'A',
      last_name: 'Agent',
      phone: null,
      latest_login: null,
      created_at: now,
      password_reset_required: false,
      status: UserStatus.ACTIVE,
      account: { sessions: [] },
      manager: { first_name: 'Manager', last_name: 'Person' },
    });
    expect(withManager.managerName).toBe('Manager Person');

    const withoutManager = mapUserView({
      id: 'agent-id',
      email: 'agent@example.com',
      role: UserRole.AGENT,
      first_name: 'A',
      last_name: 'Agent',
      phone: null,
      latest_login: null,
      created_at: now,
      password_reset_required: false,
      status: UserStatus.ACTIVE,
      account: { sessions: [] },
      manager: null,
    });
    expect(withoutManager.managerName).toBeNull();
  });

  it('maps superadmins to the protected admin role', () => {
    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    const result = mapSuperadminView({
      id: 'admin-id',
      email: 'admin@example.com',
      first_name: 'A',
      last_name: 'Admin',
      phone: null,
      latest_login: null,
      created_at: createdAt,
      status: 'ACTIVE',
      account: null,
    });

    expect(result.role).toBe('ADMIN');
    expect(result.isOnline).toBe(false);
    expect(result.createdAt).toBe(createdAt.toISOString());
  });
});
