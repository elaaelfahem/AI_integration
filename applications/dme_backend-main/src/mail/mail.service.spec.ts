import { UserRole } from '@prisma/client';
import { MailService } from './mail.service';

describe('MailService', () => {
  let sendMail: jest.Mock;
  let findAccount: jest.Mock;
  let findUserByEmail: jest.Mock;
  let createNotification: jest.Mock;
  let pushToAccount: jest.Mock;
  let service: MailService;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue(undefined);
    findAccount = jest.fn();
    findUserByEmail = jest.fn().mockResolvedValue(null);
    createNotification = jest.fn().mockResolvedValue(undefined);
    pushToAccount = jest.fn().mockResolvedValue(1);
    service = new MailService(
      { sendMail } as never,
      {
        account: { findUnique: findAccount },
        user: { findFirst: findUserByEmail },
        superadmin: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { get: (_: string, fallback: string) => fallback } as never,
      { create: createNotification } as never,
      { sendToAccount: pushToAccount } as never,
    );
  });

  const sent = () =>
    sendMail.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };

  it('sends the login code with one box per digit', async () => {
    await service.sendMfaCode('agent@orange.com', '482913');

    const mail = sent();
    expect(mail.to).toBe('agent@orange.com');
    expect(mail.subject).toBe('Votre code de vérification DME');
    expect(mail.text).toContain('Code: 482913');
    expect(mail.text).toContain('finaliser votre connexion');
    expect(mail.html.match(/class="code-box"/g)).toHaveLength(6);
    expect(mail.html).not.toMatch(/{{\s*\w+\s*}}/);
  });

  it('sends the password reset code', async () => {
    await service.sendPasswordResetCode('agent@orange.com', '123456');

    const mail = sent();
    expect(mail.subject).toBe('Votre code de réinitialisation DME');
    expect(mail.text).toContain('réinitialiser votre mot de passe');
    expect(mail.html).not.toMatch(/{{\s*\w+\s*}}/);
  });

  it.each([
    [UserRole.MANAGER, 'Manager DME'],
    [UserRole.AGENT, 'Agent DME'],
  ])('invites a %s with the matching role label', async (role, label) => {
    await service.sendInvitation({
      to: 'new@orange.com',
      role,
      invitationUrl: 'https://dme.test/invite?token=a&b',
      temporaryPassword: 'Tmp<Pass>1',
      expiresInMinutes: 60,
    });

    const mail = sent();
    expect(mail.text).toContain(`avec le rôle de ${label}.`);
    expect(mail.html).toContain(`avec le rôle de ${label}.`);
    expect(mail.html).toContain('Tmp&lt;Pass&gt;1');
    expect(mail.html).toContain('token=a&amp;b');
    expect(mail.html).not.toMatch(/{{\s*\w+\s*}}/);
  });

  describe('event emails', () => {
    const user = (overrides: Record<string, unknown> = {}) => ({
      account_type: 'USER',
      user: {
        email: 'agent@orange.com',
        first_name: 'Sami',
        role: UserRole.AGENT,
        status: 'ACTIVE',
        notify_work_updates: true,
        notify_analysis_results: true,
        ...overrides,
      },
      superadmin: null,
    });

    it('renders the shared layout with greeting and action', async () => {
      findAccount.mockResolvedValue(user());

      await service.accountUnblocked('user-id');

      const mail = sent();
      expect(mail.subject).toBe('Votre accès à Orange DME a été rétabli');
      expect(mail.text).toContain('Bonjour Sami,');
      expect(mail.text).toContain('Se connecter : http://localhost:3000/login');
      expect(mail.html).toContain('href="http://localhost:3000/login"');
      expect(mail.html).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('always sends security emails, even to a blocked account', async () => {
      findAccount.mockResolvedValue(
        user({ status: 'BLOCKED', notify_work_updates: false }),
      );

      await service.accountBlocked('user-id');

      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('skips activity emails when the user opted out or is inactive', async () => {
      findAccount.mockResolvedValueOnce(user({ notify_work_updates: false }));
      findAccount.mockResolvedValueOnce(user({ status: 'BLOCKED' }));
      const prisma = (service as unknown as { prisma: Record<string, unknown> })
        .prisma;
      prisma.inviteToken = {
        findUnique: jest.fn().mockResolvedValue({
          invited_by_id: 'manager-id',
          role_to_assign: UserRole.AGENT,
          invited_email: 'new@orange.com',
          account: null,
        }),
      };

      await service.invitationAccepted('invite-id');
      await service.invitationAccepted('invite-id');

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('records the bell notification even when activity emails are off', async () => {
      findAccount.mockResolvedValue(user({ notify_work_updates: false }));
      const prisma = (service as unknown as { prisma: Record<string, unknown> })
        .prisma;
      prisma.inviteToken = {
        findUnique: jest.fn().mockResolvedValue({
          invited_by_id: 'manager-id',
          role_to_assign: UserRole.AGENT,
          invited_email: 'new@orange.com',
          account: null,
        }),
      };

      await service.invitationAccepted('invite-id');

      expect(sendMail).not.toHaveBeenCalled();
      expect(createNotification).toHaveBeenCalledWith(
        'manager-id',
        expect.objectContaining({ type: 'INVITATION_ACCEPTED' }),
      );
    });

    it('stores type, title, body and a relative link', async () => {
      findAccount.mockResolvedValue(user());

      await service.twoFactorChanged('user-id', false);

      expect(createNotification).toHaveBeenCalledWith('user-id', {
        type: 'TWO_FACTOR_DISABLED',
        title: 'Application d’authentification désactivée',
        body: expect.stringContaining('retirée de votre compte'),
        link: '/settings',
      });
    });

    it('drops the login link, the user is already signed in', async () => {
      findAccount.mockResolvedValue(user());

      await service.accountUnblocked('user-id');

      expect(createNotification).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({ type: 'ACCOUNT_UNBLOCKED', link: null }),
      );
    });

    it('does not record notifications for a blocked account', async () => {
      findAccount.mockResolvedValue(user({ status: 'BLOCKED' }));

      await service.accountBlocked('user-id');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(createNotification).not.toHaveBeenCalled();
    });

    it('skips an email type the user turned off but keeps the bell entry', async () => {
      findAccount.mockResolvedValue(user({ email_opt_outs: ['noteAdded'] }));
      const prisma = (service as unknown as { prisma: Record<string, unknown> })
        .prisma;
      prisma.prospectingMeeting = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'meeting-id',
          agent_id: 'agent-id',
          manager_id: 'manager-id',
          title: 'Visite Sigema',
          scheduled_at: new Date('2026-10-08T09:00:00Z'),
          company: { name: 'Sigema', address: null },
        }),
      };

      await service.visitReportNoteAdded('meeting-id', 'agent-id', 'RAS');

      expect(sendMail).not.toHaveBeenCalled();
      expect(createNotification).toHaveBeenCalledWith(
        'manager-id',
        expect.objectContaining({ type: 'VISIT_REPORT_NOTE_ADDED' }),
      );
    });

    it('sends a note to the other side only, never to its author', async () => {
      findAccount.mockResolvedValue(user());
      const prisma = (service as unknown as { prisma: Record<string, unknown> })
        .prisma;
      prisma.prospectingMeeting = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'meeting-id',
          agent_id: 'agent-id',
          manager_id: 'manager-id',
          title: 'Visite Sigema',
          scheduled_at: new Date('2026-10-08T09:00:00Z'),
          company: { name: 'Sigema', address: null },
        }),
      };

      await service.visitReportNoteAdded('meeting-id', 'manager-id', 'RAS');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(createNotification).toHaveBeenCalledTimes(1);
      expect(createNotification).toHaveBeenCalledWith(
        'agent-id',
        expect.anything(),
      );
      expect(sent().text).toContain('RAS');
    });

    it('never lets a per-type switch block a security email', async () => {
      findAccount.mockResolvedValue(
        user({ email_opt_outs: ['ticketReply', 'noteAdded'] }),
      );

      await service.passwordChanged('user-id');

      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('never throws when sending fails', async () => {
      findAccount.mockResolvedValue(user());
      sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(service.passwordChanged('user-id')).resolves.toBeUndefined();
    });
  });

  describe('languages', () => {
    const englishUser = {
      account_type: 'USER',
      user: {
        email: 'agent@orange.com',
        first_name: 'Sami',
        last_name: 'Ben Ali',
        role: UserRole.AGENT,
        status: 'ACTIVE',
        notify_work_updates: true,
        notify_analysis_results: true,
        email_opt_outs: [],
        locale: 'en',
      },
      superadmin: null,
    };

    it('writes the email and the bell entry in the recipient language', async () => {
      findAccount.mockResolvedValue(englishUser);

      await service.accountUnblocked('user-id');

      const mail = sent();
      expect(mail.subject).toBe('Your Orange DME access was restored');
      expect(mail.text).toContain('Hello Sami,');
      expect(mail.text).toContain('Best regards,');
      expect(mail.html).toContain('lang="en"');
      expect(createNotification).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({
          title: 'Your Orange DME access was restored',
        }),
      );
    });

    it('sends the login code in the account language', async () => {
      findUserByEmail.mockResolvedValue({ locale: 'en' });

      await service.sendMfaCode('agent@orange.com', '482913');

      const mail = sent();
      expect(mail.subject).toBe('Your DME verification code');
      expect(mail.text).toContain('This code expires in');
      expect(mail.html).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('falls back to French for unknown emails or languages', async () => {
      findAccount.mockResolvedValue({
        ...englishUser,
        user: { ...englishUser.user, locale: 'de' },
      });

      await service.accountUnblocked('user-id');

      expect(sent().subject).toBe('Votre accès à Orange DME a été rétabli');
    });

    it('keeps invitations in French', async () => {
      await service.sendInvitation({
        to: 'new@orange.com',
        role: UserRole.AGENT,
        invitationUrl: 'https://dme.test/invite',
        temporaryPassword: 'x',
        expiresInMinutes: 60,
      });

      expect(sent().subject).toBe('Invitation à rejoindre Orange DME');
    });
  });
});
