import { http } from './client';

export interface LoginResult {
  access_token: string;
  token_type: string;
}

export async function loginRunner(username: string, password: string) {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const res = await http.post<LoginResult>('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data;
}
