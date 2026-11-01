export type SessionState = {
  goal: string;
  screenSummary: string;
  currentStep: string;
  nextStep: string;
  lastIssue: string;
  completedSteps: string[];
  securityStatus: AssistantReply['securityStatus'];
  readingConfidence: AssistantReply['confidence'];
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
  confidenceNote: string;
  securityStatus: 'strong_warning' | 'caution' | 'no_obvious_warning' | 'not_security_related' | 'unclear';
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

export const emptySessionState: SessionState = {
  goal: '',
  screenSummary: '',
  currentStep: '',
  nextStep: '',
  lastIssue: '',
  completedSteps: [],
  securityStatus: 'unclear',
  readingConfidence: 'low',
};
