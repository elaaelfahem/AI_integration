import type { EmailPreferenceKey } from '@/types/notifications';

export type AccountRole = 'SUPERADMIN' | 'MANAGER' | 'AGENT';

export interface Account {
  id: string;
  email: string;
  role: AccountRole;
  firstName: string;
  lastName: string;
  /** Saved language of the account (interface, emails, notifications). */
  language?: 'fr' | 'en';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SetupPasswordInput {
  setupToken: string;
  password: string;
  confirmPassword: string;
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface ConfirmPasswordResetInput {
  email: string;
  code: string;
}

export interface CompletePasswordResetInput {
  resetToken: string;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetRequestedResponse {
  sent: true;
}

export interface PasswordResetConfirmedResponse {
  reset: true;
}

export interface PasswordResetVerifiedResponse {
  resetToken: string;
}

export type MfaMethod = 'EMAIL' | 'SMS' | 'AUTH';

export interface AuthSession {
  mfaRequired: false;
  accessToken: string;
  expiresIn: number;
  lastActive: string;
  idleExpiresInMs: number;
  touchIntervalMs: number;
  account: Account;
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  mfaType: MfaMethod | null;
  email: string;
  phone: string | null;
}

export interface PasswordSetupChallenge {
  passwordSetupRequired: true;
  setupToken: string;
  email: string;
  firstName: string;
}

export interface InvitationSetupChallenge {
  passwordSetupRequired: true;
  setupToken: string;
  email: string;
  firstName: string;
}

export interface ForcedPasswordResetChallenge {
  passwordResetRequired: true;
  email: string;
  firstName: string;
}

export interface InvitationCheckResponse {
  valid: true;
  email: string;
  firstName: string;
  role: 'MANAGER' | 'AGENT';
  expiresAt: string;
}

export interface InvitationSentResponse {
  sent: true;
  expiresAt: string;
}

export interface InvitationCancelledResponse {
  cancelled: true;
}

export interface Manager {
  id: string;
  email: string;
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'RESET';
  invitationStatus:
    'INVITED' | 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'CANCELLED';
  firstName: string;
  lastName: string;
  role: 'MANAGER' | 'AGENT';
  createdAt: string;
}

export interface ManagedUser {
  id: string;
  accountId?: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
  firstName: string;
  lastName: string;
  phone: string | null;
  latestLogin: string | null;
  lastActive?: string | null;
  isOnline?: boolean;
  createdAt: string;
  passwordResetRequired: boolean;
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'RESET';
  managerName: string | null;
  mfaMethod?: 'EMAIL' | 'SMS' | 'AUTH' | null;
  hasAvatar?: boolean;
  notifyAnalysisResults?: boolean;
  notifyWorkUpdates?: boolean;
  emailPreferences?: Partial<Record<EmailPreferenceKey, boolean>>;
}

export interface ManagedUserActionResponse {
  updated: true;
}

export interface ConnectionEvent {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  device: string;
  browser: string;
  status: 'SUCCESS' | 'MFA_REQUIRED' | 'FAILED' | 'PASSWORD_CHANGED';
}

export interface UserManagementSummary {
  superadmins: number;
}

export type ClientCategory = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface Company {
  id: string;
  name: string;
  sector: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  ai_score: number | null;
  governorate: string | null;
  delegation: string | null;
  client_category: ClientCategory | null;
  mobile_lines: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  manager_id: string | null;
  manager?: { id: string; first_name: string; last_name: string } | null;
  _count?: { assignments: number; source_evidence?: number };
  source_evidence?: CompanySourceEvidence[];
  history?: CompanyHistory[];
}

export type DataSourceType =
  | 'OFFICIAL_REGISTRY'
  | 'BUSINESS_DIRECTORY'
  | 'MAPS'
  | 'SOCIAL_NETWORK'
  | 'COMPANY_WEBSITE'
  | 'JOB_PLATFORM'
  | 'OTHER';

export type CollectionMethod = 'API' | 'CRAWLING' | 'IMPORT' | 'MANUAL';
export type CollectionJobStatus =
  'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  collection_method: CollectionMethod;
  configuration_reference: string | null;
  enabled: boolean;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
  description?: string;
  logo?: string;
  logo_url?: string | null;
  _count?: { job_sources: number; evidence: number };
}

export interface CompanySourceEvidence {
  id: string;
  field_name: string;
  field_value: string | null;
  reference_label: string | null;
  collected_at: string;
  data_source: { id: string; name: string; type: DataSourceType };
  collection_job: {
    id: string;
    status: CollectionJobStatus;
    created_at: string;
  };
}

export interface CompanyHistory {
  id: string;
  action: 'CREATED' | 'UPDATED' | 'ENRICHED';
  summary: string;
  details: unknown;
  created_at: string;
}

export interface CollectionJob {
  id: string;
  status: CollectionJobStatus;
  filters: {
    sector?: string | null;
    governorate?: string | null;
    query?: string | null;
  } | null;
  discovered_count: number;
  created_count: number;
  enriched_count: number;
  failure_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  sources: Array<{ data_source: DataSource }>;
  _count?: { evidence: number };
}

export interface CollectionJobDetail extends CollectionJob {
  evidence: Array<{
    id: string;
    field_name: string;
    field_value: string | null;
    reference_label: string | null;
    collected_at: string;
    company: {
      id: string;
      name: string;
      sector: string | null;
      governorate: string | null;
    };
    data_source: {
      id: string;
      name: string;
      type: DataSourceType;
    };
  }>;
}

export type ProspectingEntryStatus =
  'SURFACED' | 'SHORTLISTED' | 'ASSIGNED' | 'REMOVED';

export interface Prospect {
  id: string;
  company: string;
  sector: string;
  location: string;
  score: number;
  potential: string;
  recommendation: string;
  addedAt: string;
  status: ProspectingEntryStatus;
  shortlisted: boolean;
}

export interface ProspectingCriteria {
  sector: string | null;
  governorate: string | null;
  employeeRange: '10-50' | '50-250' | '250+' | null;
  query: string | null;
}

export interface ProspectingRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  criteria: ProspectingCriteria | null;
  discovered_count: number;
  qualified_count: number;
  failure_message: string | null;
  created_at: string;
  completed_at: string | null;
  companies: Array<{
    id: string;
    name: string;
    sector: string | null;
    governorate: string | null;
    score: number | null;
  }>;
}

export interface DashboardSnapshot {
  stats: {
    totalCompanies: number;
    aiProspects: number;
    upcomingVisits: number;
    openTickets: number;
  };
  priorities: Array<{
    id: DashboardPriorityId;
    count: number;
    badge: string;
    badgeType: 'urgent' | 'assign' | 'pending';
    title: string;
    subtitle: string;
    href: string;
  }>;
  visits: Array<{
    company: string;
    agent: string;
    date: string;
    status: 'CONFIRMED' | 'PENDING' | 'TO_CONFIRM';
    statusLabel: string;
  }>;
  team: {
    title: string;
    items: Array<{
      key: DashboardTeamKey;
      icon: 'orange' | 'blue' | 'red' | 'yellow';
      label: string;
      value: string;
      note?: string;
    }>;
  };
}

export type DashboardPriorityId =
  'tickets' | 'unassigned-companies' | 'upcoming-visits';

export type DashboardTeamKey =
  | 'activeManagers'
  | 'activeAgents'
  | 'agentsWithoutAssignment'
  | 'supervisedAgents'
  | 'agentsWithAssignment'
  | 'myAssignments'
  | 'myUpcomingVisits';

export type AssignmentStatus =
  'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type AssignmentPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type VisitType =
  'FIRST_VISIT' | 'FOLLOW_UP' | 'DEMONSTRATION' | 'CONTRACT' | 'OTHER';

export interface Assignment {
  id: string;
  company: Company;
  agent_id: string;
  manager_id: string;
  scheduled_at: string;
  duration_minutes: number;
  visit_type: VisitType;
  priority: AssignmentPriority;
  objectives: string | null;
  status: AssignmentStatus;
  agent?: { user?: { first_name: string; last_name: string } | null } | null;
  manager?: {
    user?: { first_name: string; last_name: string } | null;
    superadmin?: { first_name: string; last_name: string } | null;
  } | null;
  prospection?: {
    status: ProspectionStatus;
    report?: { id: string } | null;
  } | null;
}

export type ProspectionStatus =
  'PLANNED' | 'IN_PROGRESS' | 'VISITED' | 'FOLLOW_UP' | 'CONVERTED' | 'CLOSED';
export type ReportVerdict =
  'QUALIFIED_FOLLOW_UP' | 'PENDING_INFORMATION' | 'NOT_ELIGIBLE' | 'CONVERTED';

export interface ProspectionReport {
  id: string;
  prospection_id: string;
  original_payload: Record<string, unknown>;
  summary: string;
  needs: string;
  outcome: string;
  objections: string | null;
  suggested_offer: string | null;
  next_action: string | null;
  follow_up_at: string | null;
  prospection: {
    id: string;
    assignment_id: string;
    status: ProspectionStatus;
    company: Company;
    assignment: Assignment;
  };
  processing: {
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    customer_context: string | null;
    structured_needs: string | null;
    objections: string | null;
    suggested_offer: string | null;
    visit_outcome: string | null;
    next_action: string | null;
    follow_up_at: string | null;
    verdict: ReportVerdict | null;
    reasons: string | null;
    failure_message: string | null;
    processed_at: string | null;
  } | null;
}

export type MeetingStatus =
  'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ProspectingMeeting {
  id: string;
  company_id: string;
  manager_id: string;
  agent_id: string;
  title: string;
  agenda: string | null;
  location: string | null;
  meeting_url: string | null;
  scheduled_at: string;
  duration_minutes: number;
  visit_type: VisitType;
  status: MeetingStatus;
  outcome: string | null;
  completion_notes: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  company: Company;
  agent?: { user?: { first_name: string; last_name: string } | null } | null;
  manager?: { user?: { first_name: string; last_name: string } | null } | null;
}

export type AuthResponse =
  | AuthSession
  | MfaChallenge
  | PasswordSetupChallenge
  | ForcedPasswordResetChallenge;

export type SetupPasswordResponse = AuthSession | MfaChallenge;

export interface MfaCodeSentResponse {
  sent: boolean;
  mfaType: MfaMethod;
  expiresInSeconds: number;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  lastActive: string;
  idleExpiresInMs: number;
  touchIntervalMs: number;
}

export interface TouchResponse {
  updated: boolean;
  lastActive: string;
  idleExpiresInMs: number;
  touchIntervalMs: number;
}

export type TicketType =
  'TECHNICAL' | 'CONNECTION' | 'COMPANY' | 'REPORT' | 'AI' | 'VISIT' | 'OTHER';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export interface Ticket {
  id: string;
  number: number;
  type: TicketType;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  attachment_name: string | null;
  created_at: string;
  resolved_at: string | null;
  created_by?: {
    user?: { first_name: string; last_name: string } | null;
    superadmin?: { first_name: string; last_name: string } | null;
  } | null;
  assigned_to?: {
    id: string;
    superadmin?: { first_name: string; last_name: string } | null;
  } | null;
  replies?: TicketReply[];
}

export interface TicketAssignee {
  id: string;
  name: string;
  email: string;
}

export interface TicketReply {
  id: string;
  message: string;
  created_at: string;
  author?: {
    user?: { first_name: string; last_name: string } | null;
    superadmin?: { first_name: string; last_name: string } | null;
  } | null;
}

export interface TicketStats {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
}

export type VisitReportStatus =
  'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'VALIDATED';

export type VisitReportNeed =
  'CONNECTIVITY' | 'CLOUD' | 'SECURITY' | 'SD_WAN' | 'OTHER';

export type VisitReportSolution =
  | 'ORANGE_BUSINESS_VPN'
  | 'FLEXIBLE_ENGINE_CLOUD'
  | 'ORANGE_CYBERDEFENSE'
  | 'OTHER';

export type VisitReportInterestLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type VisitReportOutcome =
  | 'INTERESTED'
  | 'TO_FOLLOW_UP'
  | 'NEGOTIATION'
  | 'OPPORTUNITY_WON'
  | 'OPPORTUNITY_LOST'
  | 'NOT_INTERESTED';

export interface VisitReportAttachment {
  id: string;
  file_name: string;
  file_mime: string;
}

export interface VisitReportNote {
  id: string;
  body: string;
  created_at: string;
  author?: { user?: { first_name: string; last_name: string } | null } | null;
}

export interface VisitReport {
  id: string;
  status: VisitReportStatus;
  summary: string | null;
  needs: VisitReportNeed[];
  solutions: VisitReportSolution[];
  interest_level: VisitReportInterestLevel | null;
  outcome_result: VisitReportOutcome | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  attachments: VisitReportAttachment[];
  notes: VisitReportNote[];
  meeting: {
    id: string;
    title: string;
    scheduled_at: string;
    duration_minutes: number;
    visit_type: VisitType;
    company: {
      id: string;
      name: string;
      sector: string | null;
      address: string | null;
      contact_name: string | null;
    };
    agent?: { user?: { first_name: string; last_name: string } | null } | null;
  };
}

export interface VisitReportStats {
  draft: number;
  submitted: number;
  inReview: number;
  validated: number;
}
