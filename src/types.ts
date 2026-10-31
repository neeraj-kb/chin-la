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

export type WebRiskCheckResult = {
  host: string;
  status: 'match' | 'no_match' | 'unavailable' | 'not_scanned';
  threatTypes: string[];
  detail?: string;
};

export type WebRiskScanResponse = {
  provider: 'Google Web Risk';
  checkedAt: string;
  results: WebRiskCheckResult[];
};

export const emptySessionState: SessionState = {
  goal: '',
  screenSummary: '',
  currentStep: '',
  nextStep: '',
  lastIssue: '',
  completedSteps: [],
};
