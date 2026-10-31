import type { AssistantReply, ChatMessage, SessionState, WebRiskScanResponse } from '../types';

const API_BASE = import.meta.env.VITE_COMPANION_API_URL || 'http://127.0.0.1:8787';

export async function checkBackend() {
  const response = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The companion service is unavailable.');
  return response.json() as Promise<{
    ok: boolean;
    configured: { gemini: boolean; groq: boolean; openrouter: boolean; openrouterChat: boolean; webRisk: boolean };
  }>;
}

export async function sendTurn(input: {
  message: string;
  frameData?: string;
  eventOnly?: boolean;
  state: SessionState;
  history: ChatMessage[];
}, signal?: AbortSignal): Promise<AssistantReply> {
  const timeoutSignal = AbortSignal.timeout(75_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  try {
    const response = await fetch(`${API_BASE}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: requestSignal,
    });
    const body = await response.json().catch((error) => {
      if (requestSignal.aborted) throw error;
      return {};
    });
    if (!response.ok) throw new Error(body.error || 'The assistant could not respond. Try again.');
    return body.reply as AssistantReply;
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new Error('The assistant took too long to respond. Please try again.');
    }
    throw error;
  }
}

export async function sendReputationScan(urls: string[], signal?: AbortSignal): Promise<WebRiskScanResponse> {
  const timeoutSignal = AbortSignal.timeout(60_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  try {
    const response = await fetch(`${API_BASE}/api/reputation-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, confirmShare: true }),
      signal: requestSignal,
    });
    const body = await response.json().catch((error) => {
      if (requestSignal.aborted) throw error;
      return {};
    });
    if (!response.ok) throw new Error(body.error || 'The reputation lookup could not finish. Try again.');
    return body as WebRiskScanResponse;
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new Error('The reputation lookup took too long. Your on-device checks are still available.');
    }
    throw error;
  }
}
