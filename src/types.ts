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

export type PreflightAIResult = {
  riskLevel: 'high' | 'caution' | 'none';
  explanation: string;
  evidence: string[];
  nextStep: string;
  steps: string[];
};

export const emptySessionState: SessionState = {
  goal: '',
  screenSummary: '',
  currentStep: '',
  nextStep: '',
  lastIssue: '',
  completedSteps: [],
};
