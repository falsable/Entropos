// Token de admin del servidor (ENTROPOS_ADMIN_TOKEN). Vive solo en sessionStorage: se borra al cerrar la pestana.
const STORAGE_KEY = 'entropos_admin_token';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage no disponible (modo privado o bloqueado): el token no se recuerda
  }
}

export function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
