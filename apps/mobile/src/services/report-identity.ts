// Browser lookup lasts for this tab only; never put a private credential in a URL.
export async function reportIdentity(): Promise<string> {
  const key = 'ado-reports-private-v1';
  const saved = sessionStorage.getItem(key);
  if (saved && /^[0-9a-f]{64}$/.test(saved)) return saved;
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(key, secret);
  return secret;
}
