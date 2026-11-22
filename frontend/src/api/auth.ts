import { request } from './client'

export interface AuthUser { id: string; email: string }
export interface AuthResponse { user: AuthUser; csrfToken: string }

export const register = (email: string, password: string) =>
  request<AuthResponse>('POST', '/auth/register', { body: { email, password } })

export const login = (email: string, password: string) =>
  request<AuthResponse>('POST', '/auth/login', { body: { email, password } })

export const me = () => request<AuthResponse>('GET', '/auth/me')

export const logout = (csrf: string | null) => request<void>('POST', '/auth/logout', { csrf })
