// Llamadas a la API del servidor: si la respuesta no es 2xx, lanza ApiError con el mensaje que mando el servidor.
import { adminHeaders } from './adminToken';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function readJsonBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function httpFailureMessage(status: number, body: any): string {
  const serverMessage = body?.error?.message ?? body?.error ?? body?.message;
  return typeof serverMessage === 'string' && serverMessage ? serverMessage : `Request failed (HTTP ${status}).`;
}

export async function fetchJson<T = any>(input: string, init?: RequestInit): Promise<T> {
  // Management routes (/api/*) require session or admin token; attach session token if available, else adminHeaders.
  const headers = new Headers(init?.headers);
  if (input.startsWith('/api/') && !headers.has('Authorization')) {
    const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('entropos_session_token') : null;
    if (sessionToken) {
      headers.set('Authorization', `Bearer ${sessionToken}`);
    } else {
      for (const [name, value] of Object.entries(adminHeaders())) headers.set(name, value);
    }
  }

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the Entropos server. Check that it is running and try again.');
  }

  const body = await readJsonBody(res);

  if (!res.ok) {
    throw new ApiError(res.status, httpFailureMessage(res.status, body));
  }
  return body as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Unexpected error.';
}
