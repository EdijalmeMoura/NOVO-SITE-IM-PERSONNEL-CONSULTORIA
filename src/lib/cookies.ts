export type CookiePreferences = { essential: true; analytics: boolean; personalization: boolean; updatedAt: string };
export const COOKIE_KEY = 'im-cookie-preferences';
export function readCookiePreferences(): CookiePreferences | null {
  try { return JSON.parse(localStorage.getItem(COOKIE_KEY) || 'null') as CookiePreferences | null; }
  catch { return null; }
}
export function saveCookiePreferences(value: Pick<CookiePreferences, 'analytics' | 'personalization'>) {
  const preferences: CookiePreferences = { essential: true, analytics: value.analytics, personalization: value.personalization, updatedAt: new Date().toISOString() };
  localStorage.setItem(COOKIE_KEY, JSON.stringify(preferences));
  return preferences;
}
