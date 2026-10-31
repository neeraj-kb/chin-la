export type PreflightRiskLevel = 'high' | 'caution' | 'none';

export type PreflightFinding = {
  id: string;
  severity: 'high' | 'caution' | 'info';
  title: string;
  detail: string;
};

export type PreflightLink = { raw: string; host: string };

export type PreflightLocalResult = {
  riskLevel: PreflightRiskLevel;
  summary: string;
  nextStep: string;
  findings: PreflightFinding[];
  links: PreflightLink[];
};

export type PreflightAIResult = {
  riskLevel: PreflightRiskLevel;
  explanation: string;
  evidence: string[];
  nextStep: string;
  steps: string[];
};

export function analyzeTextLocally(value: string): PreflightLocalResult;
export function redactLinksForAI(text: string, links: PreflightLink[]): string;
