import { emptySessionState, type ChatMessage, type SessionState } from '../types';

const STORAGE_KEY = 'screenwise-session-v1';
const MAX_MESSAGES = 60;

export type SavedSession = { messages: ChatMessage[]; state: SessionState };

export function loadSession(): SavedSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], state: emptySessionState };
    const value = JSON.parse(raw) as Partial<SavedSession>;
    return {
      messages: Array.isArray(value.messages) ? value.messages.slice(-MAX_MESSAGES) : [],
      state: { ...emptySessionState, ...(value.state || {}) },
    };
  } catch {
    return { messages: [], state: emptySessionState };
  }
}

export function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages: session.messages.slice(-MAX_MESSAGES),
      state: session.state,
    }));
  } catch {
    // Session memory is a convenience; the assistant remains usable if storage is unavailable.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing in-memory state still works when browser storage is unavailable.
  }
}
