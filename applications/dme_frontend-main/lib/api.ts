import type {
  AuthResponse,
  AuthSession,
  CompletePasswordResetInput,
  ConfirmPasswordResetInput,
  ConnectionEvent,
  InvitationCancelledResponse,
  InvitationCheckResponse,
  InvitationSentResponse,
  InvitationSetupChallenge,
  LoginCredentials,
  ManagedUser,
  ManagedUserActionResponse,
  Manager,
  MfaCodeSentResponse,
  MfaMethod,
  PasswordResetConfirmedResponse,
  PasswordResetRequestedResponse,
  PasswordResetVerifiedResponse,
  RefreshResponse,
  RequestPasswordResetInput,
  SetupPasswordInput,
  SetupPasswordResponse,
  TotpSetupResponse,
  TouchResponse,
  UserManagementSummary,
  Assignment,
  Company,
  ProspectingMeeting,
  Ticket,
  TicketAssignee,
  TicketStats,
  VisitReport,
  VisitReportStats,
  CollectionJob,
  CollectionJobDetail,
  DataSource,
  Prospect,
  ProspectingCriteria,
  ProspectingRun,
  DashboardSnapshot,
  ProspectionReport,
  ProspectionStatus,
} from '@/types/auth';
import type {
  EmailPreferenceKey,
  NotificationFilters,
  NotificationPage,
} from '@/types/notifications';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthApi {
  private accessToken: string | null = null;
  private refreshRequest: Promise<RefreshResponse> | null = null;

  async getEmailWhitelist(): Promise<string> {
    const response = await this.request<{ whitelist: string }>(
      '/auth/whitelist',
      {
        method: 'GET',
      },
    );
    return response.whitelist;
  }

  async login(credentials: LoginCredentials) {
    const response = await this.request<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if ('accessToken' in response) {
      this.accessToken = response.accessToken;
    }

    return response;
  }

  async setupPassword(input: SetupPasswordInput) {
    const response = await this.request<SetupPasswordResponse>(
      '/password/setup',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );

    if (!response.mfaRequired) {
      this.accessToken = response.accessToken;
    }

    return response;
  }

  async checkInvitation(token: string) {
    return this.request<InvitationCheckResponse>('/invitations/check', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async verifyInvitation(token: string, password: string) {
    return this.request<InvitationSetupChallenge>('/invitations/verify', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async listManagers() {
    return this.authorizedRequest<Manager[]>('/invitations/managers', {
      method: 'GET',
    });
  }

  async inviteManager(input: {
    email: string;
    role: 'MANAGER' | 'AGENT';
    firstName?: string;
    lastName?: string;
    phone?: string;
    mfaEnabled?: boolean;
    managerId?: string;
  }) {
    return this.authorizedRequest<InvitationSentResponse>(
      '/invitations/managers',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async resendManagerInvitation(managerId: string) {
    return this.authorizedRequest<InvitationSentResponse>(
      `/invitations/managers/${managerId}/resend`,
      {
        method: 'POST',
      },
    );
  }

  async cancelManagerInvitation(managerId: string) {
    return this.authorizedRequest<InvitationCancelledResponse>(
      `/invitations/managers/${managerId}/cancel`,
      {
        method: 'POST',
      },
    );
  }

  async listUsers() {
    return this.authorizedRequest<ManagedUser[]>('/users', {
      method: 'GET',
    });
  }

  async listAgents() {
    return this.authorizedRequest<
      Array<{
        id: string;
        account: { id: string };
        first_name: string;
        last_name: string;
        email: string;
        phone?: string | null;
        status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
        manager_id?: string | null;
        manager_account_id?: string | null;
      }>
    >('/users/agents', { method: 'GET' });
  }

  async getOwnProfile() {
    return this.authorizedRequest<ManagedUser>('/users/me', {
      method: 'GET',
    });
  }

  async updateOwnProfile(input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  }) {
    return this.authorizedRequest<ManagedUser>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async uploadOwnAvatar(file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.authorizedRequest<ManagedUser>('/users/me/avatar', {
      method: 'POST',
      body,
    });
  }

  async removeOwnAvatar() {
    return this.authorizedRequest<ManagedUser>('/users/me/avatar', {
      method: 'DELETE',
    });
  }

  async getAvatar(userId: string) {
    return this.authorizedFileRequest(`/users/${userId}/avatar`, {
      method: 'GET',
    });
  }

  async updateLanguage(language: 'fr' | 'en') {
    return this.authorizedRequest<ManagedUser>('/users/me/language', {
      method: 'PATCH',
      body: JSON.stringify({ language }),
    });
  }

  async updateNotificationPreferences(preferences: {
    notifyAnalysisResults?: boolean;
    notifyWorkUpdates?: boolean;
    emailPreferences?: Partial<Record<EmailPreferenceKey, boolean>>;
  }) {
    return this.authorizedRequest<ManagedUser>(
      '/users/me/notification-preferences',
      { method: 'PATCH', body: JSON.stringify(preferences) },
    );
  }

  async listNotifications(filters: NotificationFilters = {}) {
    const params = new URLSearchParams({ limit: String(filters.limit ?? 15) });
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.status && filters.status !== 'all')
      params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    return this.authorizedRequest<NotificationPage>(
      `/notifications?${params.toString()}`,
      { method: 'GET' },
    );
  }

  async getUnreadNotificationCount() {
    return this.authorizedRequest<{ count: number }>(
      '/notifications/unread-count',
      { method: 'GET' },
    );
  }

  async markNotificationRead(id: string) {
    return this.authorizedRequest<{ unreadCount: number }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' },
    );
  }

  async markNotificationsRead(ids: string[]) {
    return this.authorizedRequest<{ unreadCount: number }>(
      '/notifications/read',
      { method: 'POST', body: JSON.stringify({ ids }) },
    );
  }

  async deleteNotification(id: string) {
    return this.authorizedRequest<{ deleted: number; unreadCount: number }>(
      `/notifications/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  }

  async deleteNotifications(ids: string[]) {
    return this.authorizedRequest<{ deleted: number; unreadCount: number }>(
      '/notifications/delete',
      { method: 'POST', body: JSON.stringify({ ids }) },
    );
  }

  async deleteReadNotifications() {
    return this.authorizedRequest<{ deleted: number; unreadCount: number }>(
      '/notifications/delete-read',
      { method: 'POST' },
    );
  }

  async markAllNotificationsRead() {
    return this.authorizedRequest<{ unreadCount: number }>(
      '/notifications/read-all',
      { method: 'POST' },
    );
  }

  async disableTotp(password: string) {
    return this.authorizedRequest<{ mfaType: string }>('/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async setupTotpForSelf() {
    return this.authorizedRequest<{
      secret: string;
      otpauthUrl: string;
      qrCodeDataUrl: string;
    }>('/mfa/totp/self-setup', { method: 'POST' });
  }

  async confirmTotpForSelf(code: string) {
    return this.authorizedRequest<{ mfaType: string }>(
      '/mfa/totp/self-confirm',
      { method: 'POST', body: JSON.stringify({ code }) },
    );
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.authorizedRequest<{ updated: boolean }>('/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async getOwnConnectionHistory() {
    return this.authorizedRequest<ConnectionEvent[]>('/users/me/connections', {
      method: 'GET',
    });
  }

  async getConnectionHistory(userId: string) {
    return this.authorizedRequest<ConnectionEvent[]>(
      `/users/${userId}/connections`,
      { method: 'GET' },
    );
  }

  async getUserManagementSummary() {
    return this.authorizedRequest<UserManagementSummary>('/users/summary', {
      method: 'GET',
    });
  }

  async listCompanies() {
    return this.authorizedRequest<Company[]>('/companies', { method: 'GET' });
  }

  async getCompany(id: string) {
    return this.authorizedRequest<Company>(`/companies/${id}`, {
      method: 'GET',
    });
  }

  async listDataSources() {
    return this.authorizedRequest<DataSource[]>('/data-sources', {
      method: 'GET',
    });
  }

  async createDataSource(input: {
    name: string;
    type: string;
    collectionMethod: string;
    configurationReference?: string;
    logoUrl?: string;
    description?: string;
    enabled?: boolean;
  }) {
    return this.authorizedRequest<DataSource>('/data-sources', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateDataSource(
    id: string,
    input: Partial<{
      name: string;
      type: string;
      collectionMethod: string;
      configurationReference: string;
      logoUrl: string;
      description: string;
      enabled: boolean;
    }>,
  ) {
    return this.authorizedRequest<DataSource>(`/data-sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async setDataSourceEnabled(id: string, enabled: boolean) {
    return this.authorizedRequest<DataSource>(
      `/data-sources/${id}/${enabled ? 'enable' : 'disable'}`,
      { method: 'POST' },
    );
  }

  async retireDataSource(id: string) {
    return this.authorizedRequest<DataSource>(`/data-sources/${id}`, {
      method: 'DELETE',
    });
  }

  async listCollectionJobs() {
    return this.authorizedRequest<CollectionJob[]>(
      '/data-sources/jobs/history',
      { method: 'GET' },
    );
  }

  async getCollectionJob(id: string) {
    return this.authorizedRequest<CollectionJobDetail>(
      `/data-sources/jobs/${id}`,
      { method: 'GET' },
    );
  }

  async startCollectionJob(input: {
    sourceIds: string[];
    sector?: string;
    governorate?: string;
    query?: string;
  }) {
    return this.authorizedRequest<CollectionJob>('/data-sources/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listProspects() {
    return this.authorizedRequest<Prospect[]>('/prospecting', {
      method: 'GET',
    });
  }

  async getDashboard() {
    return this.authorizedRequest<DashboardSnapshot>('/dashboard', {
      method: 'GET',
    });
  }

  async getProspectingCriteria() {
    return this.authorizedRequest<ProspectingCriteria>(
      '/prospecting/criteria',
      {
        method: 'GET',
      },
    );
  }

  async updateProspectingCriteria(input: Partial<ProspectingCriteria>) {
    return this.authorizedRequest<ProspectingCriteria>(
      '/prospecting/criteria',
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
  }

  async listProspectingHistory() {
    return this.authorizedRequest<ProspectingRun[]>('/prospecting/history', {
      method: 'GET',
    });
  }

  async askCompanyAssistant(companyId: string, question: string) {
    return this.authorizedRequest<{
      answer: string;
      next_action: string;
      key_facts: string[];
      warnings: string[];
      model_used: boolean;
    }>(`/ai/companies/${companyId}/assistant`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  async cleanVisitReport(meetingId: string, text: string) {
    return this.authorizedRequest<{
      executive_summary: string;
      warnings: string[];
      model_used: boolean;
    }>(`/ai/meetings/${meetingId}/clean-report`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async startProspecting(input: Partial<ProspectingCriteria>) {
    return this.authorizedRequest<{
      id: string;
      status: 'RUNNING' | 'COMPLETED' | 'FAILED';
      discoveredCount: number;
      qualifiedCount: number;
    }>('/prospecting/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async shortlistProspect(companyId: string) {
    return this.authorizedRequest<{ companyId: string; status: string }>(
      `/prospecting/${companyId}/shortlist`,
      { method: 'POST' },
    );
  }

  async removeProspectFromShortlist(companyId: string) {
    return this.authorizedRequest<{ companyId: string; status: string }>(
      `/prospecting/${companyId}/shortlist`,
      { method: 'DELETE' },
    );
  }

  async assignProspect(
    companyId: string,
    input: { agentId: string; managerId?: string; scheduledAt: string },
  ) {
    return this.authorizedRequest<Assignment>(
      `/prospecting/${companyId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async createCompany(input: Partial<Company> & { name: string }) {
    return this.authorizedRequest<Company>('/companies', {
      method: 'POST',
      body: JSON.stringify(toCompanyPayload(input)),
    });
  }

  async updateCompany(id: string, input: Partial<Company>) {
    return this.authorizedRequest<Company>(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(toCompanyPayload(input)),
    });
  }

  async archiveCompany(id: string) {
    return this.authorizedRequest<Company>(`/companies/${id}`, {
      method: 'DELETE',
    });
  }

  async listAssignments() {
    return this.authorizedRequest<Assignment[]>('/assignments', {
      method: 'GET',
    });
  }

  async createAssignment(input: Record<string, unknown>) {
    return this.authorizedRequest<Assignment>('/assignments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateAssignment(id: string, input: Record<string, unknown>) {
    return this.authorizedRequest<Assignment>(`/assignments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async deleteAssignment(id: string) {
    return this.authorizedRequest<{ id: string }>(`/assignments/${id}`, {
      method: 'DELETE',
    });
  }

  async updateProspection(
    assignmentId: string,
    input: {
      status: ProspectionStatus;
      notes?: string;
      nextAction?: string;
      followUpAt?: string;
    },
  ) {
    return this.authorizedRequest(`/prospections/${assignmentId}/update`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async submitProspectionReport(
    assignmentId: string,
    input: {
      summary: string;
      needs: string;
      outcome: string;
      objections?: string;
      suggestedOffer?: string;
      nextAction?: string;
      followUpAt?: string;
    },
  ) {
    return this.authorizedRequest<ProspectionReport>(
      `/reports/${assignmentId}`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async getProspectionReport(assignmentId: string) {
    return this.authorizedRequest<ProspectionReport>(
      `/reports/${assignmentId}`,
      { method: 'GET' },
    );
  }

  async exportProspectionReport(assignmentId: string) {
    return this.authorizedFileRequest(`/reports/${assignmentId}/export`, {
      method: 'GET',
    });
  }

  async listMeetings(query = '') {
    return this.authorizedRequest<ProspectingMeeting[]>(`/meetings${query}`, {
      method: 'GET',
    });
  }

  async getMeeting(id: string) {
    return this.authorizedRequest<ProspectingMeeting>(`/meetings/${id}`, {
      method: 'GET',
    });
  }

  async createMeeting(input: Record<string, unknown>) {
    return this.authorizedRequest<ProspectingMeeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateMeeting(id: string, input: Record<string, unknown>) {
    return this.authorizedRequest<ProspectingMeeting>(`/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async listTickets(query = '') {
    return this.authorizedRequest<Ticket[]>(`/tickets${query}`, {
      method: 'GET',
    });
  }

  async getTicketStats() {
    return this.authorizedRequest<TicketStats>('/tickets/stats', {
      method: 'GET',
    });
  }

  async getTicket(id: string) {
    return this.authorizedRequest<Ticket>(`/tickets/${id}`, {
      method: 'GET',
    });
  }

  async createTicket(input: {
    type: string;
    subject: string;
    description: string;
    priority?: string;
    attachment?: File;
  }) {
    const body = new FormData();
    body.append('type', input.type);
    body.append('subject', input.subject);
    body.append('description', input.description);
    if (input.priority) body.append('priority', input.priority);
    if (input.attachment) body.append('attachment', input.attachment);
    return this.authorizedRequest<Ticket>('/tickets', {
      method: 'POST',
      body,
    });
  }

  async updateTicket(
    id: string,
    input: { status?: string; priority?: string },
  ) {
    return this.authorizedRequest<Ticket>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async addTicketReply(id: string, message: string) {
    return this.authorizedRequest<Ticket>(`/tickets/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getTicketAttachment(id: string) {
    return this.authorizedFileRequest(`/tickets/${id}/attachment`, {
      method: 'GET',
    });
  }

  async listTicketAssignees() {
    return this.authorizedRequest<TicketAssignee[]>('/tickets/assignees', {
      method: 'GET',
    });
  }

  async assignTicket(id: string, assigneeId: string | null) {
    return this.authorizedRequest<Ticket>(`/tickets/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    });
  }

  async listVisitReports(query = '') {
    return this.authorizedRequest<VisitReport[]>(`/visit-reports${query}`, {
      method: 'GET',
    });
  }

  async getVisitReportStats() {
    return this.authorizedRequest<VisitReportStats>('/visit-reports/stats', {
      method: 'GET',
    });
  }

  async getVisitReport(meetingId: string) {
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}`,
      { method: 'GET' },
    );
  }

  async saveVisitReport(
    meetingId: string,
    input: {
      summary?: string;
      needs?: string[];
      solutions?: string[];
      interestLevel?: string;
      outcomeResult?: string;
    },
  ) {
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  }

  async submitVisitReport(meetingId: string) {
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}/submit`,
      { method: 'POST' },
    );
  }

  async reviewVisitReport(
    meetingId: string,
    status: 'IN_REVIEW' | 'VALIDATED',
  ) {
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}/review`,
      { method: 'POST', body: JSON.stringify({ status }) },
    );
  }

  async addVisitReportAttachment(meetingId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}/attachments`,
      { method: 'POST', body },
    );
  }

  async removeVisitReportAttachment(meetingId: string, attachmentId: string) {
    return this.authorizedRequest<{ success: boolean }>(
      `/visit-reports/by-meeting/${meetingId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
    );
  }

  async getVisitReportAttachment(meetingId: string, attachmentId: string) {
    return this.authorizedFileRequest(
      `/visit-reports/by-meeting/${meetingId}/attachments/${attachmentId}`,
      { method: 'GET' },
    );
  }

  async addVisitReportNote(meetingId: string, body: string) {
    return this.authorizedRequest<VisitReport>(
      `/visit-reports/by-meeting/${meetingId}/notes`,
      { method: 'POST', body: JSON.stringify({ body }) },
    );
  }

  async removeVisitReportNote(meetingId: string, noteId: string) {
    return this.authorizedRequest<{ success: boolean }>(
      `/visit-reports/by-meeting/${meetingId}/notes/${noteId}`,
      { method: 'DELETE' },
    );
  }

  async listCompanyVisitReports(companyId: string) {
    return this.authorizedRequest<VisitReport[]>(
      `/companies/${companyId}/reports`,
      { method: 'GET' },
    );
  }

  async exportUsers(format: 'csv' | 'xlsx') {
    return this.authorizedFileRequest(`/users/export?format=${format}`, {
      method: 'GET',
    });
  }

  async exportCompanies(format: 'csv' | 'xlsx') {
    return this.authorizedFileRequest(`/companies/export?format=${format}`, {
      method: 'GET',
    });
  }

  async getCompaniesImportTemplate(format: 'csv' | 'xlsx') {
    return this.authorizedFileRequest(
      `/companies/import-template?format=${format}`,
      { method: 'GET' },
    );
  }

  async importCompanies(file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.authorizedRequest<{
      created: number;
      duplicates: number;
      skipped: { row: number; reason: string }[];
    }>('/companies/import', { method: 'POST', body });
  }

  async updateUser(
    userId: string,
    input: { firstName?: string; lastName?: string; phone?: string | null },
  ) {
    return this.authorizedRequest<ManagedUser>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async blockUser(userId: string) {
    return this.authorizedRequest<ManagedUserActionResponse>(
      `/users/${userId}/block`,
      {
        method: 'POST',
      },
    );
  }

  async unblockUser(userId: string) {
    return this.authorizedRequest<ManagedUserActionResponse>(
      `/users/${userId}/unblock`,
      {
        method: 'POST',
      },
    );
  }

  async deleteUser(userId: string) {
    return this.authorizedRequest<ManagedUserActionResponse>(
      `/users/${userId}`,
      { method: 'DELETE' },
    );
  }

  async requireUserPasswordReset(userId: string) {
    return this.authorizedRequest<ManagedUserActionResponse>(
      `/users/${userId}/password-reset`,
      {
        method: 'POST',
      },
    );
  }

  async requestPasswordReset(input: RequestPasswordResetInput) {
    return this.request<PasswordResetRequestedResponse>(
      '/password/reset/request',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async verifyPasswordResetCode(input: ConfirmPasswordResetInput) {
    return this.request<PasswordResetVerifiedResponse>(
      '/password/reset/verify',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async confirmPasswordReset(input: CompletePasswordResetInput) {
    return this.request<PasswordResetConfirmedResponse>(
      '/password/reset/confirm',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  async requestMfaCode(mfaToken: string, method?: MfaMethod) {
    return this.request<MfaCodeSentResponse>('/mfa/request', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, method }),
    });
  }

  async verifyMfaCode(mfaToken: string, code: string, method?: MfaMethod) {
    const response = await this.request<AuthSession>('/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code, method }),
    });
    this.accessToken = response.accessToken;
    return response;
  }

  async setupTotp(mfaToken: string) {
    return this.request<TotpSetupResponse>('/mfa/totp/setup', {
      method: 'POST',
      body: JSON.stringify({ mfaToken }),
    });
  }

  async confirmTotp(mfaToken: string, code: string) {
    const response = await this.request<AuthSession>('/mfa/totp/confirm', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code }),
    });
    this.accessToken = response.accessToken;
    return response;
  }

  async restore() {
    return this.refresh();
  }

  async touch() {
    return this.authorizedRequest<TouchResponse>('/touch', {
      method: 'POST',
    });
  }

  async logout() {
    try {
      await this.authorizedRequest<void>('/logout', {
        method: 'POST',
      });
    } finally {
      this.accessToken = null;
    }
  }

  clear() {
    this.accessToken = null;
  }

  private async authorizedRequest<T>(path: string, init: RequestInit) {
    if (!this.accessToken) {
      await this.restore();
    }

    try {
      return await this.request<T>(path, init, this.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error;
      }

      const session = await this.restore();
      return this.request<T>(path, init, session.accessToken);
    }
  }

  private async authorizedFileRequest(path: string, init: RequestInit) {
    if (!this.accessToken) {
      await this.restore();
    }

    try {
      return await this.requestFile(path, init, this.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error;
      }

      const session = await this.restore();
      return this.requestFile(path, init, session.accessToken);
    }
  }

  private async refresh() {
    if (!this.refreshRequest) {
      this.refreshRequest = this.request<RefreshResponse>('/refresh', {
        method: 'POST',
        // Let this request (and its Set-Cookie response) complete even if
        // the initiating page unloads mid-flight, e.g. from a reload
        // racing the mount effect's session restore.
        keepalive: true,
      })
        .then((response) => {
          this.accessToken = response.accessToken;
          return response;
        })
        .finally(() => {
          this.refreshRequest = null;
        });
    }

    return this.refreshRequest;
  }

  private async requestFile(
    path: string,
    init: RequestInit,
    accessToken?: string | null,
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await this.fetchWithResilience(path, init, accessToken);

    if (!response.ok) {
      throw new ApiError(await getErrorMessage(response), response.status);
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filenameMatch = /filename="?([^";]+)"?/.exec(disposition);
    const filename = filenameMatch?.[1] ?? 'export';

    return { blob: await response.blob(), filename };
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    accessToken?: string | null,
  ): Promise<T> {
    const isFormData = init.body instanceof FormData;
    const response = await this.fetchWithResilience(
      path,
      {
        ...init,
        headers: {
          ...(isFormData ? undefined : { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
      },
      accessToken,
    );

    if (!response.ok) {
      throw new ApiError(await getErrorMessage(response), response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private async fetchWithResilience(
    path: string,
    init: RequestInit,
    accessToken?: string | null,
  ) {
    const canRetry = (init.method ?? 'GET').toUpperCase() === 'GET';
    const maxAttempts = canRetry ? 3 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        path === '/prospecting/runs'
          ? 330_000
          : path.startsWith('/ai/')
            ? 100_000
            : API_REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch(`${API_URL}${path}`, {
          ...init,
          signal: init.signal ?? controller.signal,
          credentials: 'include',
          headers: {
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : undefined),
            ...init.headers,
          },
        });

        if (response.status !== 503 || attempt === maxAttempts - 1) {
          return response;
        }

        await response.body?.cancel();
      } catch {
        if (controller.signal.aborted) {
          throw new ApiError(
            'The backend did not respond in time. Check that the API server is running.',
            0,
          );
        }

        if (attempt === maxAttempts - 1) {
          throw new ApiError(
            'The backend could not be reached. Check that the API server is running.',
            0,
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }

      await waitBeforeRetry(attempt);
    }

    throw new ApiError(
      'The backend could not be reached. Check that the API server is running.',
      0,
    );
  }
}

function waitBeforeRetry(attempt: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 250 * 2 ** attempt);
  });
}

async function getErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };

    if (Array.isArray(body.message)) {
      return body.message[0] ?? 'The request could not be completed.';
    }

    return body.message ?? 'The request could not be completed.';
  } catch {
    return 'The service is temporarily unavailable.';
  }
}

function toCompanyPayload(input: Partial<Company>) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.sector !== undefined && { sector: input.sector }),
    ...(input.contact_name !== undefined && {
      contactName: input.contact_name,
    }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.ai_score !== undefined && { aiScore: input.ai_score }),
    ...(input.governorate !== undefined && {
      governorate: input.governorate,
    }),
    ...(input.delegation !== undefined && { delegation: input.delegation }),
    ...(input.client_category !== undefined && {
      clientCategory: input.client_category,
    }),
    ...(input.mobile_lines !== undefined && {
      mobileLines: input.mobile_lines,
    }),
    ...(input.manager_id !== undefined && { managerId: input.manager_id }),
    ...(input.status !== undefined && { status: input.status }),
  };
}

export const authApi = new AuthApi();
