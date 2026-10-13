import {
  buildCsv,
  buildExportFilename,
  buildXlsx,
  type TabularColumn,
  type TabularExportFormat,
} from '../common/utils/tabular-export.util';
import type { ManagedUserView } from './users.mapper';

export type UsersExportFormat = TabularExportFormat;

const EXPORT_COLUMNS: TabularColumn<ManagedUserView>[] = [
  { header: 'Email', value: (user) => user.email },
  { header: 'First name', value: (user) => user.firstName },
  { header: 'Last name', value: (user) => user.lastName },
  { header: 'Role', value: (user) => user.role },
  { header: 'Status', value: (user) => user.status },
  { header: 'Phone', value: (user) => user.phone ?? '' },
  { header: 'Created at', value: (user) => user.createdAt },
  { header: 'Latest login', value: (user) => user.latestLogin ?? '' },
  { header: 'Last active', value: (user) => user.lastActive ?? '' },
];

export function buildUsersExportFilename(format: UsersExportFormat) {
  return buildExportFilename('dme-users', format);
}

export function buildUsersCsv(users: ManagedUserView[]): Buffer {
  return buildCsv(EXPORT_COLUMNS, users);
}

export function buildUsersXlsx(users: ManagedUserView[]): Promise<Buffer> {
  return buildXlsx('Users', EXPORT_COLUMNS, users);
}
