// Client-side cookie utilities.
// These functions manage cookies in the browser only.
// Server actions handle cookie updates on the server side.

export async function setClientCookie(key: string, value: string, days = 7): Promise<void> {
  if (typeof window === "undefined" || !("cookieStore" in window)) return;
  const expires = new Date(Date.now() + days * 864e5);
  await window.cookieStore.set({ name: key, value, expires, path: "/" });
}

export async function getClientCookie(key: string): Promise<string | undefined> {
  if (typeof window === "undefined" || !("cookieStore" in window)) return undefined;
  const cookie = await window.cookieStore.get({ name: key });
  return cookie?.value;
}

export async function deleteClientCookie(key: string): Promise<void> {
  if (typeof window === "undefined" || !("cookieStore" in window)) return;
  await window.cookieStore.delete({ name: key, path: "/" });
}
