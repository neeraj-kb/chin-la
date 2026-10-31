export type SessionState = {
  goal: string;
  screenSummary: string;
  currentStep: string;
  nextStep: string;
  lastIssue: string;
  completedSteps: string[];
};

export type AssistantReply = {
  explanation: string;
  background: string;
  nextStep: string;
  steps: string[];
  currentStep: string;
  goal: string;
  screenSummary: string;
  lastIssue: string;
  completedSteps: string[];
  confidence: 'high' | 'medium' | 'low';
  shouldInterrupt: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  reply?: AssistantReply;
};

export type CaptureSource = {
  id: string;
  name: string;
  kind: string;
  thumbnail: string | null;
};

export type CommunityThreatCheck = {
  source: 'PhishTank' | 'URLhaus';
  status: 'match' | 'no_match' | 'unverified' | 'unavailable' | 'not_configured' | 'not_scanned';
  detail?: string;
};

export type CommunityUrlCheck = {
  host: string;
  sources: CommunityThreatCheck[];
};

export type ReputationScanResponse = {
  provider: 'Community threat feeds';
  checkedAt: string;
  results: CommunityUrlCheck[];
};

export const emptySessionState: SessionState = {
  goal: '',
  screenSummary: '',
  currentStep: '',
  nextStep: '',
  lastIssue: '',
  completedSteps: [],
};
