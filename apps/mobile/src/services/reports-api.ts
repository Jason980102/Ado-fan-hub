import { reportIdentity } from './report-identity';

export type ReportDraft = {
  request_id: string; kind: 'bug' | 'content'; category: string;
  title: string; description: string; target: string; steps: string;
  expected: string; environment: string; consent: true;
};
export type ReportReceipt = {
  id: string; kind: 'bug' | 'content'; title: string;
  status: 'received' | 'reviewing' | 'resolved' | 'closed';
  created_at: number; updated_at: number;
};

export class ReportError extends Error {
  constructor(public code: 'configuration' | 'storage' | 'network' | 'validation' | 'limited' | 'unavailable' | 'conflict') { super(code); }
}

function isReceipt(value: unknown): value is ReportReceipt {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && /^AFH-[A-F0-9]{16}$/.test(row.id)
    && (row.kind === 'bug' || row.kind === 'content') && typeof row.title === 'string'
    && ['received', 'reviewing', 'resolved', 'closed'].includes(String(row.status))
    && typeof row.created_at === 'number' && typeof row.updated_at === 'number';
}

async function request(method: 'GET' | 'POST', body?: ReportDraft) {
  const base = process.env.EXPO_PUBLIC_REPORTS_API_URL || process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new ReportError('configuration');
  let url: URL;
  try {
    url = new URL(base);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:'))) throw new Error();
  } catch { throw new ReportError('configuration'); }
  let secret: string;
  try { secret = await reportIdentity(); } catch { throw new ReportError('storage'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/reports`, {
      method, signal: controller.signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new ReportError(response.status === 429 ? 'limited'
      : response.status === 422 || response.status === 413 ? 'validation'
      : response.status === 409 ? 'conflict' : 'unavailable');
    return await response.json();
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError('network');
  } finally { clearTimeout(timer); }
}

export async function submitReport(draft: ReportDraft): Promise<ReportReceipt> {
  const result: unknown = await request('POST', draft);
  if (!isReceipt(result)) throw new ReportError('unavailable');
  return result;
}
export async function listReports(): Promise<ReportReceipt[]> {
  const result = await request('GET');
  if (!Array.isArray(result?.reports) || result.reports.length > 50 || !result.reports.every(isReceipt)) throw new ReportError('unavailable');
  return result.reports;
}
