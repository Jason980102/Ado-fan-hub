// Match Pydantic str_strip_whitespace and Python Unicode code-point lengths.
export const normalizeReportText = (value: string) => value.replace(/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, '');
export const reportLength = (value: string) => Array.from(normalizeReportText(value)).length;
export const reportLimits = { title: 120, description: 4000, target: 500, steps: 2000, expected: 1000 } as const;
export type ReportField = keyof typeof reportLimits;
export type ReportValues = Record<ReportField, string> & { kind: 'bug' | 'content'; consent: boolean };
export function reportMinimum(field: ReportField, kind: ReportValues['kind']) {
  return field === 'title' ? 5 : field === 'description' ? 20 : field === 'target' && kind === 'content' ? 3 : field === 'steps' && kind === 'bug' ? 10 : 0;
}
export function validateReport(values: ReportValues) {
  const errors: Partial<Record<ReportField | 'consent', 'required' | 'short' | 'long'>> = {};
  for (const field of Object.keys(reportLimits) as ReportField[]) {
    if (values.kind === 'content' && (field === 'steps' || field === 'expected')) continue;
    const count = reportLength(values[field]);
    const min = reportMinimum(field, values.kind);
    if (min && !count) errors[field] = 'required';
    else if (count < min) errors[field] = 'short';
    else if (count > reportLimits[field]) errors[field] = 'long';
  }
  if (!values.consent) errors.consent = 'required';
  return errors;
}
