import { UserRecord, WorkspaceRecord, AuthSessionResponse, SubscriptionState } from '../types/router';
import { fetchJson } from './api';

const TOKEN_KEY = 'entropos_session_token';
const USER_KEY = 'entropos_user';
const WORKSPACE_KEY = 'entropos_workspace';

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredWorkspace(): WorkspaceRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStoredSession(data: AuthSessionResponse): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data.workspace));
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

export async function registerWithEmail(email: string, password: string, name: string): Promise<AuthSessionResponse> {
  const data = await fetchJson<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  saveStoredSession(data);
  return data;
}

export async function loginWithEmail(email: string, password: string): Promise<AuthSessionResponse> {
  const data = await fetchJson<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  saveStoredSession(data);
  return data;
}

export async function loginWithGitHub(email?: string, name?: string): Promise<AuthSessionResponse> {
  const data = await fetchJson<AuthSessionResponse>('/api/auth/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });
  saveStoredSession(data);
  return data;
}

export async function fetchCurrentSession(): Promise<{ user: UserRecord; workspace: WorkspaceRecord; subscription: SubscriptionState } | null> {
  const token = getStoredSessionToken();
  if (!token) return null;
  try {
    const data = await fetchJson<{ user: UserRecord; workspace: WorkspaceRecord; subscription: SubscriptionState }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function logoutSession(): Promise<void> {
  const token = getStoredSessionToken();
  if (token) {
    try {
      await fetchJson('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  }
  clearStoredSession();
}
