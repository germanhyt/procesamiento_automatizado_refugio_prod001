import { http } from './client';

export interface LoginResult {
  access_token: string;
  token_type: string;
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
