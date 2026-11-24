const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem('triagesync_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('triagesync_token', token);
  else localStorage.removeItem('triagesync_token');
}

export async function api<T>(
  path: string,
  options: RequestInit & { agent?: string } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.agent) headers['X-Agent'] = options.agent;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = data?.error?.code || 'INTERNAL_ERROR';
    const message = data?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}