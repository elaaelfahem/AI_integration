import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_ROLES, type AppRole } from '../auth.types';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  function context(role?: AppRole) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { role } } : {}),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows routes without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue([APP_ROLES.MANAGER]);
    expect(guard.canActivate(context(APP_ROLES.MANAGER))).toBe(true);
  });

  it('rejects a missing or mismatched role', () => {
    reflector.getAllAndOverride.mockReturnValue([APP_ROLES.SUPERADMIN]);
    expect(() => guard.canActivate(context(APP_ROLES.AGENT))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
