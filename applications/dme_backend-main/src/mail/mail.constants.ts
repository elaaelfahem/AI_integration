import { UserRole } from '@prisma/client';

export const MAIL_LOGO_URL = 'https://i.ibb.co/SXrHc5Qb/images-1.png';

export const MAIL_SUBJECTS = {
  mfaCode: 'Votre code de vérification DME',
  passwordResetCode: 'Votre code de réinitialisation DME',
  invitation: 'Invitation à rejoindre Orange DME',
} as const;

export const DEFAULT_EVENT_FOOTER =
  'Cet e-mail a été envoyé automatiquement par la plateforme Orange DME. Merci de ne pas y répondre.';

export const INVITATION_ROLE_LABELS: Record<UserRole, string> = {
  MANAGER: 'Manager DME',
  AGENT: 'Agent DME',
};
