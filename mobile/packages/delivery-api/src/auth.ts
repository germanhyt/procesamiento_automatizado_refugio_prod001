import { http } from './client';

export interface LoginResult {
  access_token: string;
  token_type: string;
}

export interface AuthPermission {
  id: number;
  name: string;
  codename: string;
  module?: string | null;
}

export interface AuthRole {
  id: number;
  name: string;
  description?: string | null;
  permissions: AuthPermission[];
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  roles: AuthRole[];
  created_at: string;
}

export function userHasPermission(user: AuthUser | undefined, codename: string): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  return user.roles?.some((r) => r.permissions?.some((p) => p.codename === codename)) ?? false;
}

export async function fetchAuthMe() {
  const res = await http.get<AuthUser>('/auth/me');
  return res.data;
}

export async function loginRunner(username: string, password: string) {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  // RN + axios: enviar string; si se pasa URLSearchParams tal cual, FastAPI a veces
  // no recibe el body y responde 422 (OAuth2PasswordRequestForm).
  const res = await http.post<LoginResult>('/auth/login', params?.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
}
