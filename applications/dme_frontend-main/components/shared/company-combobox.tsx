'use client';

import { Combobox } from '@/components/shared/combobox';
import type { Company } from '@/types/auth';

export function CompanyCombobox({
  companies,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  id,
}: {
  companies: Company[];
  value: string;
  onChange: (companyId: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}) {
  return (
    <Combobox
      items={companies.map((company) => ({
        id: company.id,
        label: company.name,
      }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      id={id}
    />
  );
}
