'use client';

import dynamic from 'next/dynamic';

export const CompanyMap = dynamic(
  () =>
    import('@/components/meetings/company-map').then((mod) => mod.CompanyMap),
  { ssr: false },
);
