export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type Job = {
  id: string;
  slug: string;
  title: string;
  hiring_organization: string;
  area: string;
  city: string;
  state: string;
  modality: string;
  employment_type: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  differentiators: string[];
  benefits: string[];
  published: boolean;
  featured: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminSession = { authenticated: boolean; csrf?: string; user?: { email: string; name?: string } };
export type AdminUser = { id: string; email: string; name: string; active: boolean; created_at: string; updated_at: string; last_login_at: string };
let csrfToken = '';
export const setCsrfToken = (value: string) => { csrfToken = value; };

async function handleResponse<T>(response: Response): Promise<T> {
  let payload: any;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new ApiError(payload?.error || 'Não foi possível concluir a solicitação.', response.status);
  return payload as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handleResponse<T>(await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } }));
}
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return handleResponse<T>(await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }, body: JSON.stringify(body) }));
}
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return handleResponse<T>(await fetch(path, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) }));
}
export async function apiForm<T>(path: string, body: FormData): Promise<T> {
  return handleResponse<T>(await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body }));
}
// Envio multipart autenticado (upload de imagem no painel). O Content-Type é definido pelo navegador com o boundary.
export async function apiAdminForm<T>(path: string, body: FormData, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  return handleResponse<T>(await fetch(path, { method, credentials: 'same-origin', headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken }, body }));
}
export async function apiDelete<T>(path: string): Promise<T> {
  return handleResponse<T>(await fetch(path, { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken } }));
}
export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('pt-BR', options).format(date);
}
