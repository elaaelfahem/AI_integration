import type { Messages } from '@/lib/i18n/messages';
import type {
  VisitReportInterestLevel,
  VisitReportNeed,
  VisitReportOutcome,
  VisitReportSolution,
  VisitReportStatus,
} from '@/types/auth';

export const VISIT_REPORT_NEEDS: VisitReportNeed[] = [
  'CONNECTIVITY',
  'CLOUD',
  'SECURITY',
  'SD_WAN',
  'OTHER',
];

export const VISIT_REPORT_SOLUTIONS: VisitReportSolution[] = [
  'ORANGE_BUSINESS_VPN',
  'FLEXIBLE_ENGINE_CLOUD',
  'ORANGE_CYBERDEFENSE',
  'OTHER',
];

export const VISIT_REPORT_INTEREST_LEVELS: VisitReportInterestLevel[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
];

export const VISIT_REPORT_OUTCOMES: VisitReportOutcome[] = [
  'INTERESTED',
  'TO_FOLLOW_UP',
  'NEGOTIATION',
  'OPPORTUNITY_WON',
  'OPPORTUNITY_LOST',
  'NOT_INTERESTED',
];

export const VISIT_REPORT_STATUSES: VisitReportStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'VALIDATED',
];

export function visitReportNeedLabel(
  need: VisitReportNeed,
  t: Messages['visitReportsPage'],
) {
  switch (need) {
    case 'CONNECTIVITY':
      return t.needConnectivity;
    case 'CLOUD':
      return t.needCloud;
    case 'SECURITY':
      return t.needSecurity;
    case 'SD_WAN':
      return t.needSdWan;
    default:
      return t.needOther;
  }
}

export function visitReportSolutionLabel(
  solution: VisitReportSolution,
  t: Messages['visitReportsPage'],
) {
  switch (solution) {
    case 'ORANGE_BUSINESS_VPN':
      return t.solutionVpn;
    case 'FLEXIBLE_ENGINE_CLOUD':
      return t.solutionCloud;
    case 'ORANGE_CYBERDEFENSE':
      return t.solutionCyberdefense;
    default:
      return t.solutionOther;
  }
}

export function visitReportInterestLabel(
  level: VisitReportInterestLevel,
  t: Messages['visitReportsPage'],
) {
  switch (level) {
    case 'LOW':
      return t.interestLow;
    case 'MEDIUM':
      return t.interestMedium;
    default:
      return t.interestHigh;
  }
}

export function visitReportOutcomeLabel(
  outcome: VisitReportOutcome,
  t: Messages['visitReportsPage'],
) {
  switch (outcome) {
    case 'INTERESTED':
      return t.outcomeInterested;
    case 'TO_FOLLOW_UP':
      return t.outcomeToFollowUp;
    case 'NEGOTIATION':
      return t.outcomeNegotiation;
    case 'OPPORTUNITY_WON':
      return t.outcomeOpportunityWon;
    case 'OPPORTUNITY_LOST':
      return t.outcomeOpportunityLost;
    default:
      return t.outcomeNotInterested;
  }
}

export function visitReportStatusLabel(
  status: VisitReportStatus,
  t: Messages['visitReportsPage'],
) {
  switch (status) {
    case 'DRAFT':
      return t.statusDraft;
    case 'SUBMITTED':
      return t.statusSubmitted;
    case 'IN_REVIEW':
      return t.statusInReview;
    default:
      return t.statusValidated;
  }
}
