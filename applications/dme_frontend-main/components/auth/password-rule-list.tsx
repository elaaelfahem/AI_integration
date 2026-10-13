import type { getPasswordRuleResults } from './password-rules';

interface PasswordRuleListProps {
  rules: ReturnType<typeof getPasswordRuleResults>;
}

export function PasswordRuleList({ rules }: PasswordRuleListProps) {
  return (
    <ul className="password-rule-list" id="password-rules">
      {rules.map((rule) => (
        <li
          className={`password-rule${rule.isMet ? ' password-rule-met' : ''}`}
          key={rule.key}
        >
          <span aria-hidden="true" />
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
