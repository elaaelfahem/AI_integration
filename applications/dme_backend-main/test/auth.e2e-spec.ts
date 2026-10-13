import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'totp-secret'),
  generateURI: jest.fn(() => 'otpauth://totp/Orange-DME'),
  verify: jest.fn(() => ({ valid: true })),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => 'data:image/png;base64,qr'),
}));

describe('Authentication flow', () => {
  let app: INestApplication;
  let database: ReturnType<typeof createDatabase>;
  let sentPasswordResetCode = '';
  let sendPasswordResetCode: jest.Mock;

  beforeAll(async () => {
    database = createDatabase();
    sendPasswordResetCode = jest.fn((_: string, code: string) => {
      sentPasswordResetCode = code;
    });

    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .overrideProvider(MailService)
      .useValue(
        // Event emails (password changed, 2FA, ...) are no-ops here.
        new Proxy<Record<string | symbol, unknown>>(
          { sendMfaCode: jest.fn(), sendPasswordResetCode },
          {
            get: (target, key): unknown =>
              key in target || key === 'then'
                ? target[key]
                : () => Promise.resolve(),
          },
        ),
      )
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    sendPasswordResetCode.mockClear();
    sendPasswordResetCode.mockImplementation((_: string, code: string) => {
      sentPasswordResetCode = code;
    });
    sentPasswordResetCode = '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects malformed login input', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'invalid', password: 'short' })
      .expect(400);
  });

  it('rejects invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'admin@example.com', password: 'WrongPassword1!' })
      .expect(401);
  });

  it('runs login, touch, refresh rotation, and logout end to end', async () => {
    database.useActiveUser();

    const client = request.agent(app.getHttpServer());
    const login = await client
      .post('/login')
      .send({ email: 'AGENT@example.com', password: 'SecurePassword123!' })
      .expect(200);

    expect(login.body).toMatchObject({
      expiresIn: 300,
      idleExpiresInMs: 12_000,
      touchIntervalMs: 1_000,
      account: {
        id: database.account.id,
        email: 'agent@example.com',
        role: 'AGENT',
      },
    });
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(login.body.refreshToken).toBeUndefined();

    const firstAccessToken = login.body.accessToken as string;
    const firstRefreshCookie = login.headers['set-cookie'] as string[];

    const throttledTouch = await client
      .post('/touch')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .set('Cookie', cookieHeader(firstRefreshCookie))
      .expect(200);

    expect(throttledTouch.body.updated).toBe(false);
    expect(throttledTouch.body.touchIntervalMs).toBe(1_000);
    expect(throttledTouch.body.idleExpiresInMs).toBeGreaterThan(11_000);

    database.session!.last_active = new Date(Date.now() - 1_100);

    const writtenTouch = await client
      .post('/touch')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .set('Cookie', cookieHeader(firstRefreshCookie))
      .expect(200);

    expect(writtenTouch.body.updated).toBe(true);
    expect(writtenTouch.body.idleExpiresInMs).toBeGreaterThan(11_000);

    const oldRefreshHash = database.session!.refresh_token_hash;
    const refresh = await client
      .post('/refresh')
      .set('Cookie', cookieHeader(firstRefreshCookie))
      .expect(200);

    expect(refresh.body).toMatchObject({ expiresIn: 300 });
    expect(refresh.body.idleExpiresInMs).toBeGreaterThan(11_000);
    expect(refresh.body.touchIntervalMs).toBe(1_000);
    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(database.session!.refresh_token_hash).not.toBe(oldRefreshHash);

    await client
      .post('/logout')
      .set('Authorization', `Bearer ${refresh.body.accessToken as string}`)
      .set('Cookie', cookieHeader(refresh.headers['set-cookie'] as string[]))
      .expect(204);

    expect(database.session).toBeNull();
    expect(database.account.active_session_id).toBeNull();

    await client.post('/refresh').expect(401);
  });

  it('expires and removes a session after 15 minutes of inactivity', async () => {
    database.useActiveUser();

    const client = request.agent(app.getHttpServer());
    const login = await client
      .post('/login')
      .send({ email: 'agent@example.com', password: 'SecurePassword123!' })
      .expect(200);
    const refreshCookie = login.headers['set-cookie'] as string[];

    database.session!.last_active = new Date(Date.now() - 12_001);

    await client
      .post('/refresh')
      .set('Cookie', cookieHeader(refreshCookie))
      .expect(401);

    expect(database.session).toBeNull();
    expect(database.account.active_session_id).toBeNull();
    expect(login.body.accessToken).toEqual(expect.any(String));
  });

  it('requires an access token for touch and logout', async () => {
    await request(app.getHttpServer()).post('/touch').expect(401);
    await request(app.getHttpServer()).post('/logout').expect(401);
  });

  it('requires pending accounts to set their first password before activation', async () => {
    database.usePendingSuperadmin();

    const login = await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'admin@example.com', password: 'SecurePassword123!' })
      .expect(200);

    expect(login.body).toMatchObject({
      passwordSetupRequired: true,
      email: 'admin@example.com',
      firstName: 'Super',
    });
    expect(login.body.setupToken).toEqual(expect.any(String));
    expect(login.headers['set-cookie']).toBeUndefined();
    expect(database.account.superadmin.status).toBe('PENDING');

    await request(app.getHttpServer())
      .post('/password/setup')
      .send({
        setupToken: login.body.setupToken,
        password: 'PasswordWithoutNumber!',
        confirmPassword: 'PasswordWithoutNumber!',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/password/setup')
      .send({
        setupToken: login.body.setupToken,
        password: 'NewSecurePassword123!',
        confirmPassword: 'WrongSecurePassword123!',
      })
      .expect(400);

    const setup = await request(app.getHttpServer())
      .post('/password/setup')
      .send({
        setupToken: login.body.setupToken,
        password: 'NewSecurePassword123!',
        confirmPassword: 'NewSecurePassword123!',
      })
      .expect(200);

    expect(database.account.superadmin.status).toBe('ACTIVE');
    expect(
      bcrypt.compareSync(
        'NewSecurePassword123!',
        database.account.superadmin.password_hash,
      ),
    ).toBe(true);
    expect(setup.body).toMatchObject({
      mfaRequired: true,
      email: 'admin@example.com',
    });
    expect(setup.headers['set-cookie']).toBeUndefined();
  });

  it('runs reset password with a tracked one-time code', async () => {
    database.useActiveUser();

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'missing@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ sent: true });
      });
    expect(database.passwordResetCode).toBeNull();

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'agent@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ sent: true });
      });

    expect(database.passwordResetCode).toEqual(
      expect.objectContaining({
        account_id: database.account.id,
        attempts: 0,
        used_at: null,
      }),
    );
    expect(sentPasswordResetCode).toMatch(/^\d{6}$/);
    const firstResetCode = sentPasswordResetCode;

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'agent@example.com' })
      .expect(200);

    expect(database.passwordResetCodes).toHaveLength(2);
    expect(database.passwordResetCodes[0].used_at).toEqual(expect.any(Date));
    expect(database.passwordResetCodes[1].used_at).toBeNull();
    expect(sentPasswordResetCode).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post('/password/reset/verify')
      .send({
        email: 'agent@example.com',
        code: firstResetCode,
      })
      .expect(401);

    expect(database.passwordResetCode?.attempts).toBe(1);

    await request(app.getHttpServer())
      .post('/password/reset/verify')
      .send({
        email: 'agent@example.com',
        code: '000000',
      })
      .expect(401);

    expect(database.passwordResetCode?.attempts).toBe(2);

    const verified = await request(app.getHttpServer())
      .post('/password/reset/verify')
      .send({
        email: 'agent@example.com',
        code: sentPasswordResetCode,
      })
      .expect(200);

    expect(verified.body.resetToken).toEqual(expect.any(String));

    database.session = {
      id: '9ed5cfb2-a158-417c-8e7e-26d0ca13b0ae',
      account_id: database.account.id,
      refresh_token_hash: 'hash',
      last_active: new Date(),
      created_at: new Date(),
    };
    database.account.active_session_id = database.session.id;

    await request(app.getHttpServer())
      .post('/password/reset/confirm')
      .send({
        resetToken: verified.body.resetToken,
        password: 'ResetSecurePassword123!',
        confirmPassword: 'ResetSecurePassword123!',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ reset: true });
      });

    expect(database.passwordResetCode?.used_at).toEqual(expect.any(Date));
    expect(database.session).toBeNull();
    expect(database.account.active_session_id).toBeNull();
    expect(
      bcrypt.compareSync(
        'ResetSecurePassword123!',
        database.account.user!.password_hash,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/password/reset/confirm')
      .send({
        resetToken: verified.body.resetToken,
        password: 'AnotherSecurePassword123!',
        confirmPassword: 'AnotherSecurePassword123!',
      })
      .expect(401);
  });

  it('does not save a reset code when the email cannot be sent', async () => {
    database.useActiveUser();
    sendPasswordResetCode.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'agent@example.com' })
      .expect(503);

    expect(database.passwordResetCodes).toHaveLength(0);
  });

  it('limits reset password emails in the configured time window', async () => {
    database.useActiveUser();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post('/password/reset/request')
        .send({ email: 'agent@example.com' })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'agent@example.com' })
      .expect(429);

    expect(sendPasswordResetCode).toHaveBeenCalledTimes(3);
    expect(database.passwordResetCodes).toHaveLength(3);
    expect(
      database.passwordResetCodes.filter((code) => !code.used_at),
    ).toHaveLength(1);
  });

  it('rejects a reset token if the account stops being active before confirmation', async () => {
    database.useActiveUser();

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'agent@example.com' })
      .expect(200);

    const verified = await request(app.getHttpServer())
      .post('/password/reset/verify')
      .send({
        email: 'agent@example.com',
        code: sentPasswordResetCode,
      })
      .expect(200);

    database.account.user!.status = 'PENDING';

    await request(app.getHttpServer())
      .post('/password/reset/confirm')
      .send({
        resetToken: verified.body.resetToken,
        password: 'ResetSecurePassword123!',
        confirmPassword: 'ResetSecurePassword123!',
      })
      .expect(401);

    expect(database.passwordResetCode?.used_at).toBeNull();
  });

  it('does not allow pending accounts to use password reset', async () => {
    database.usePendingSuperadmin();

    await request(app.getHttpServer())
      .post('/password/reset/request')
      .send({ email: 'admin@example.com' })
      .expect(403);

    expect(database.passwordResetCode).toBeNull();
    expect(database.account.superadmin.status).toBe('PENDING');

    await request(app.getHttpServer())
      .post('/password/reset/verify')
      .send({
        email: 'admin@example.com',
        code: '123456',
      })
      .expect(401);

    expect(database.account.superadmin.status).toBe('PENDING');
  });
});

function createDatabase() {
  type TransactionInput =
    Array<Promise<unknown>> | ((client: Record<string, unknown>) => unknown);
  type PasswordResetCodeRecord = {
    id: string;
    account_id: string;
    code_hash: string;
    attempts: number;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
  };

  const account = {
    id: '8ed5cfb2-a158-417c-8e7e-26d0ca13b0ae',
    account_type: 'SUPERADMIN',
    active_session_id: null as string | null,
    user: null as {
      email: string;
      password_hash: string;
      role: 'MANAGER' | 'AGENT';
      status: 'PENDING' | 'ACTIVE' | 'BLOCKED';
      first_name: string;
      last_name: string;
      phone: string | null;
      mfa_type: null;
      mfa_secret: null;
    } | null,
    superadmin: {
      email: 'admin@example.com',
      password_hash: bcrypt.hashSync('SecurePassword123!', 4),
      status: 'ACTIVE',
      first_name: 'Super',
      last_name: 'Admin',
      phone: null as string | null,
      mfa_type: null,
      mfa_secret: null,
    },
  };

  const user = {
    email: 'agent@example.com',
    password_hash: bcrypt.hashSync('SecurePassword123!', 4),
    role: 'AGENT' as const,
    status: 'ACTIVE' as const,
    first_name: 'DME',
    last_name: 'Agent',
    phone: null,
    mfa_type: null,
    mfa_secret: null,
  };

  const superadmin = {
    email: 'admin@example.com',
    password_hash: bcrypt.hashSync('SecurePassword123!', 4),
    status: 'ACTIVE' as const,
    first_name: 'Super',
    last_name: 'Admin',
    phone: null,
    mfa_type: null,
    mfa_secret: null,
  };

  let session: {
    id: string;
    account_id: string;
    refresh_token_hash: string;
    ip_address?: string;
    last_active: Date;
    created_at: Date;
  } | null = null;

  let passwordResetCode: PasswordResetCodeRecord | null = null;
  let passwordResetCodes: PasswordResetCodeRecord[] = [];

  function accountSnapshot() {
    return {
      ...account,
      user: account.user ? { ...account.user } : null,
      superadmin: { ...account.superadmin },
    };
  }

  function matchesAccountStatus(
    status: string,
    filter?: 'PENDING' | 'ACTIVE' | 'BLOCKED',
  ) {
    return !filter || status === filter;
  }

  function findAccountByEmail(
    email: string,
    filters?: Array<{
      user?: {
        status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
      };
      superadmin?: {
        status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
      };
    }>,
  ) {
    const normalizedEmail = email.toLowerCase();

    const userFilter = filters?.find((filter) => filter.user)?.user;
    const superadminFilter = filters?.find(
      (filter) => filter.superadmin,
    )?.superadmin;

    if (
      account.account_type === 'USER' &&
      account.user?.email.toLowerCase() === normalizedEmail &&
      matchesAccountStatus(account.user.status, userFilter?.status)
    ) {
      return {
        ...accountSnapshot(),
        account_type: 'USER',
        superadmin: null,
      };
    }

    if (
      account.account_type === 'SUPERADMIN' &&
      account.superadmin.email.toLowerCase() === normalizedEmail &&
      matchesAccountStatus(account.superadmin.status, superadminFilter?.status)
    ) {
      return {
        ...accountSnapshot(),
        account_type: 'SUPERADMIN',
        user: null,
      };
    }

    return null;
  }

  function findAccountById(
    id: string,
    filters?: Array<{
      user?: {
        status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
      };
      superadmin?: {
        status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
      };
    }>,
  ) {
    if (id !== account.id) {
      return null;
    }

    const userFilter = filters?.find((filter) => filter.user)?.user;
    const superadminFilter = filters?.find(
      (filter) => filter.superadmin,
    )?.superadmin;

    if (
      account.account_type === 'USER' &&
      account.user &&
      matchesAccountStatus(account.user.status, userFilter?.status)
    ) {
      return {
        ...accountSnapshot(),
        account_type: 'USER',
        superadmin: null,
      };
    }

    if (
      account.account_type === 'SUPERADMIN' &&
      account.superadmin &&
      matchesAccountStatus(account.superadmin.status, superadminFilter?.status)
    ) {
      return {
        ...accountSnapshot(),
        account_type: 'SUPERADMIN',
        user: null,
      };
    }

    return null;
  }

  const prisma = {
    account: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            id?: string;
            OR?: Array<{
              user?: {
                email?: { equals: string };
                status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
              };
              superadmin?: {
                email?: { equals: string };
                status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
              };
            }>;
          };
        }) => {
          const email =
            where.OR?.[0]?.user?.email?.equals ??
            where.OR?.[1]?.superadmin?.email?.equals ??
            '';

          if (where.id) {
            return findAccountById(where.id, where.OR);
          }

          return findAccountByEmail(email, where.OR);
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === account.id ? accountSnapshot() : null,
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            active_session_id?: string | null;
            superadmin?: { update: { latest_login: Date } };
          };
        }) => {
          if ('active_session_id' in data) {
            account.active_session_id = data.active_session_id ?? null;
          }
          return account;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; active_session_id: string };
          data: { active_session_id: null };
        }) => {
          if (
            account.id === where.id &&
            account.active_session_id === where.active_session_id
          ) {
            account.active_session_id = data.active_session_id;
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
    },
    connectionEvent: {
      create: jest.fn(async () => ({
        id: randomUuid(999),
      })),
    },
    superadmin: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            email: { equals: string };
            status: 'PENDING' | 'ACTIVE';
          };
        }) => {
          if (
            account.account_type === 'SUPERADMIN' &&
            account.superadmin.email.toLowerCase() ===
              where.email.equals.toLowerCase() &&
            account.superadmin.status === where.status
          ) {
            return { id: account.id, ...account.superadmin };
          }

          return null;
        },
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            password_hash?: string;
            status?: 'PENDING' | 'ACTIVE';
            first_name?: string;
            last_name?: string;
            phone?: string | null;
          };
        }) => {
          account.superadmin = {
            ...account.superadmin,
            ...data,
          };
          return account.superadmin;
        },
      ),
    },
    user: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            email: { equals: string };
            status: 'PENDING' | 'ACTIVE' | 'BLOCKED';
          };
        }) => {
          if (
            account.account_type === 'USER' &&
            account.user?.email.toLowerCase() ===
              where.email.equals.toLowerCase() &&
            account.user.status === where.status
          ) {
            return { id: account.id, ...account.user };
          }

          return null;
        },
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            password_hash?: string;
            status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
          };
        }) => {
          if (account.user) {
            account.user = {
              ...account.user,
              ...data,
            };
          }
          return account.user;
        },
      ),
    },
    session: {
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            id: string;
            account_id: string;
            refresh_token_hash: string;
            ip_address?: string;
            last_active: Date;
          };
        }) => {
          session = { ...data, created_at: new Date() };
          return session;
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            account_id: string;
            account: { active_session_id: string };
            OR: Array<{
              refresh_token_hash?: string;
              previous_refresh_token_hash?: string;
            }>;
          };
        }) => {
          const refreshHash = where.OR.find(
            (condition) => condition.refresh_token_hash,
          )?.refresh_token_hash;
          const previousHash = where.OR.find(
            (condition) => condition.previous_refresh_token_hash,
          )?.previous_refresh_token_hash;
          return session &&
            session.id === where.id &&
            session.account_id === where.account_id &&
            (session.refresh_token_hash === refreshHash ||
              session.refresh_token_hash === previousHash) &&
            account.active_session_id === where.account.active_session_id
            ? { ...session }
            : null;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { refresh_token_hash: string };
        }) => {
          if (!session || session.id !== where.id) {
            throw new Error('Session not found');
          }
          session.refresh_token_hash = data.refresh_token_hash;
          return session;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
            account_id?: string;
            refresh_token_hash?: string;
            last_active?: { lte: Date };
          };
          data: { last_active?: Date; refresh_token_hash?: string };
        }) => {
          if (
            session &&
            session.id === where.id &&
            (!where.account_id || session.account_id === where.account_id) &&
            (!where.refresh_token_hash ||
              session.refresh_token_hash === where.refresh_token_hash) &&
            (!where.last_active || session.last_active <= where.last_active.lte)
          ) {
            if (data.last_active) {
              session.last_active = data.last_active;
            }
            if (data.refresh_token_hash) {
              session.refresh_token_hash = data.refresh_token_hash;
            }
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
      deleteMany: jest.fn(
        async ({ where }: { where: { id?: string; account_id?: string } }) => {
          if (
            session &&
            (!where.id || session.id === where.id) &&
            (!where.account_id || session.account_id === where.account_id)
          ) {
            session = null;
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
    },
    passwordResetCode: {
      count: jest.fn(
        async ({
          where,
        }: {
          where: {
            account_id: string;
            created_at?: { gte: Date };
          };
        }) =>
          passwordResetCodes.filter(
            (code) =>
              code.account_id === where.account_id &&
              (!where.created_at || code.created_at >= where.created_at.gte),
          ).length,
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            account_id: string;
            code_hash: string;
            expires_at: Date;
          };
        }) => {
          passwordResetCode = {
            id: randomUuid(passwordResetCodes.length + 1),
            account_id: data.account_id,
            code_hash: data.code_hash,
            attempts: 0,
            expires_at: data.expires_at,
            used_at: null,
            created_at: new Date(),
          };
          passwordResetCodes.push(passwordResetCode);
          return passwordResetCode;
        },
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { account_id: string; used_at: null } }) =>
          passwordResetCodes
            .filter(
              (code) =>
                code.account_id === where.account_id &&
                code.used_at === where.used_at,
            )
            .sort(
              (left, right) =>
                right.created_at.getTime() - left.created_at.getTime(),
            )
            .map((code) => ({ ...code }))[0] ?? null,
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { attempts?: { increment: number }; used_at?: Date };
        }) => {
          const code = passwordResetCodes.find((item) => item.id === where.id);

          if (!code) {
            throw new Error('Password reset code not found');
          }
          if (data.attempts) {
            code.attempts += data.attempts.increment;
          }
          if (data.used_at) {
            code.used_at = data.used_at;
          }
          passwordResetCode = code;
          return code;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { account_id: string; used_at?: null };
          data: { used_at: Date };
        }) => {
          let count = 0;
          for (const code of passwordResetCodes) {
            if (
              code.account_id === where.account_id &&
              (!('used_at' in where) || code.used_at === where.used_at)
            ) {
              code.used_at = data.used_at;
              count += 1;
            }
          }
          return { count };
        },
      ),
      deleteMany: jest.fn(
        async ({
          where,
        }: {
          where: { account_id: string; used_at?: null };
        }) => {
          const before = passwordResetCodes.length;
          passwordResetCodes = passwordResetCodes.filter(
            (code) =>
              code.account_id !== where.account_id ||
              ('used_at' in where && code.used_at !== where.used_at),
          );
          passwordResetCode =
            passwordResetCodes[passwordResetCodes.length - 1] ?? null;
          return { count: before - passwordResetCodes.length };
        },
      ),
    },
    $transaction: jest.fn(async (callback: TransactionInput) => {
      if (Array.isArray(callback)) {
        return Promise.all(callback);
      }

      return callback(prisma as Record<string, unknown>);
    }),
  };

  return {
    account,
    prisma,
    useActiveUser() {
      account.account_type = 'USER';
      account.user = { ...user };
      account.superadmin = { ...superadmin };
      account.active_session_id = null;
      session = null;
      passwordResetCode = null;
      passwordResetCodes = [];
    },
    usePendingSuperadmin() {
      account.account_type = 'SUPERADMIN';
      account.user = { ...user };
      account.superadmin = { ...superadmin, status: 'PENDING' };
      account.active_session_id = null;
      session = null;
      passwordResetCode = null;
      passwordResetCodes = [];
    },
    get session() {
      return session;
    },
    set session(value: typeof session) {
      session = value;
    },
    get passwordResetCode() {
      return passwordResetCode;
    },
    get passwordResetCodes() {
      return passwordResetCodes;
    },
  };
}

function randomUuid(value: number) {
  return `7ed5cfb2-a158-417c-8e7e-26d0ca13b${value.toString().padStart(3, '0')}`;
}

function cookieHeader(setCookie: string[]) {
  return setCookie.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}
