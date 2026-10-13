import type { Messages } from '@/lib/i18n/messages/types';

type PasswordRuleKey = keyof Messages['passwordRules'];

const RULE_TESTS: { key: PasswordRuleKey; test: (value: string) => boolean }[] =
  [
    { key: 'minLength', test: (value) => value.length >= 8 },
    { key: 'lowercase', test: (value) => /[a-z]/.test(value) },
    { key: 'uppercase', test: (value) => /[A-Z]/.test(value) },
    { key: 'number', test: (value) => /\d/.test(value) },
    { key: 'specialChar', test: (value) => /[^A-Za-z0-9]/.test(value) },
  ];

export function getPasswordRuleResults(
  password: string,
  labels: Messages['passwordRules'],
) {
  return RULE_TESTS.map((rule) => ({
    key: rule.key,
    label: labels[rule.key],
    isMet: rule.test(password),
  }));
}
