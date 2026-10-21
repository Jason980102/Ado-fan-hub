import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors as C } from '@/constants/fan-theme';
import { normalizeReportText, reportLength, reportLimits, reportMinimum, validateReport, type ReportField } from '@/utils/report-validation';
import { reportsCopy } from '@/constants/reports-copy';
import { listReports, ReportError, submitReport, type ReportDraft, type ReportReceipt } from '@/services/reports-api';

function ReportButton({ label, onPress, busy, secondary = false }: { label: string; onPress: () => void; busy: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={busy}
    style={[s.button, secondary && s.secondary, busy && { opacity: 0.5 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}

export default function ReportsScreen() {
  const { i18n } = useTranslation();
  const c = reportsCopy(i18n.resolvedLanguage || i18n.language);
  const [kind, setKind] = useState<'bug' | 'content'>('bug');
  const [category, setCategory] = useState('other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [records, setRecords] = useState<ReportReceipt[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<ReportField | 'consent', boolean>>>({});
  const locked = useRef(false);
  const values = { kind, title, description, target, steps, expected, consent };
  const validation = validateReport(values);
  const environment = `App ${Constants.expoConfig?.version || 'unknown'}; ${Platform.OS} ${Platform.Version}`;
  const categories = kind === 'bug' ? ['crash', 'display', 'data', 'other'] : ['spam', 'harassment', 'rights', 'unsafe', 'other'];

  function review() {
    setAttempted(true);
    if (Object.keys(validation).length) { setError(c.invalid); return; }
    setError('');
    try {
      setDraft({ request_id: Crypto.randomUUID(), kind, category, title: normalizeReportText(title), description: normalizeReportText(description),
        target: normalizeReportText(target), steps: kind === 'bug' ? normalizeReportText(steps) : '', expected: kind === 'bug' ? normalizeReportText(expected) : '', environment, consent: true });
    } catch { setError(c.errors.configuration); }
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(c.errors[e instanceof ReportError ? e.code : 'unavailable']); }
    finally { locked.current = false; setBusy(false); }
  }
  function reset() {
    setAttempted(false); setTouched({});
    setDraft(null); setReceipt(null); setTitle(''); setDescription(''); setTarget(''); setSteps(''); setExpected(''); setConsent(false); setError('');
  }
  function message(template: string, field: ReportField) {
    const count = reportLength(values[field]);
    const min = reportMinimum(field, kind);
    const max = reportLimits[field];
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(({ count, min, max, remaining: min - count, excess: count - max } as Record<string, number>)[key]));
  }
  function field(key: ReportField, label: string, value: string, onChangeText: (v: string) => void, multiline = false) {
    const required = reportMinimum(key, kind) > 0;
    const issue = (attempted || touched[key]) && validation[key];
    const feedback = issue ? message(issue === 'required' ? c.validation.empty : c.validation[issue], key) : '';
    return <View style={s.field}><Text style={s.label}>{label}{required ? ' *' : ''}</Text><TextInput
      accessibilityLabel={label + (required ? ', ' + c.validation.required : '')}
      accessibilityHint={feedback || message(c.validation.count, key)} aria-invalid={!!issue}
      value={value} onChangeText={v => { setTouched(previous => ({ ...previous, [key]: true })); onChangeText(v); setError(''); }}
      onBlur={() => setTouched(previous => ({ ...previous, [key]: true }))} multiline={multiline}
      style={[s.input, multiline && s.multiline, !!issue && s.invalidInput]} placeholderTextColor={C.subtle} />
      <Text style={s.hint}>{message(c.validation.count, key)}</Text>
      {!!feedback && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{feedback}</Text>}
    </View>;
  }
  return <SafeAreaView style={s.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <RoseScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
        <Text style={s.eyebrow}>ADO FAN HUB · CLOSED TEST</Text>
        <Text style={s.heading}>{c.heading}</Text>
        <ReportButton label={c.back} onPress={() => router.replace('/settings')} busy={busy} secondary />
        <Text style={s.body}>{c.intro}</Text><Text style={s.body}>{c.privacy}</Text>
        {receipt ? <View style={s.card}>
          <Text accessibilityRole="header" style={s.heading}>{c.received}</Text>
          <Text selectable style={s.label}>{c.caseId}: {receipt.id}</Text>
          <Text style={s.body}>{c.statuses[receipt.status]}</Text>
          <ReportButton label={c.next} onPress={reset} busy={busy} />
        </View> : draft ? <View style={s.card}>
          <Text style={s.heading}>{c.reviewTitle}</Text>
          <Text style={s.label}>{draft.kind === 'bug' ? c.bug : c.content} · {c.categories[draft.category as keyof typeof c.categories]}</Text>
          {[draft.title, draft.description, draft.target, draft.steps, draft.expected, draft.environment].filter(Boolean).map((v, n) => <Text selectable key={n} style={s.body}>{v}</Text>)}
          <Text style={s.body}>{c.consent}</Text>
          <ReportButton label={busy ? c.sending : c.confirm} onPress={() => void run(async () => { if (Object.keys(validateReport(draft)).length) { setDraft(null); setAttempted(true); setError(c.invalid); return; } setReceipt(await submitReport(draft)); setDraft(null); setRecords(null); })} busy={busy} />
          <ReportButton label={c.edit} onPress={() => { setDraft(null); setError(''); }} busy={busy} secondary />
        </View> : <View style={s.card}>
          <Text style={s.hint}>{c.validation.requiredLegend}</Text>
          <Text style={s.label}>{c.kindLabel} *</Text>
          <View style={s.choices}>{(['bug', 'content'] as const).map(v => <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: kind === v }}
            style={[s.choice, kind === v && s.selected]} onPress={() => { setKind(v); setCategory('other'); setError(''); }}><Text style={s.label}>{c[v]}</Text></Pressable>)}</View>
          <Text style={s.label}>{c.category} *</Text>
          <View style={s.choices}>{categories.map(v => <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: category === v }}
            style={[s.choice, category === v && s.selected]} onPress={() => setCategory(v)}><Text style={s.label}>{c.categories[v as keyof typeof c.categories]}</Text></Pressable>)}</View>
          {field('title', c.title, title, setTitle)}
          {field('target', c.target, target, setTarget)}
          {field('description', c.description, description, setDescription, true)}
          {kind === 'bug' && <>{field('steps', c.steps, steps, setSteps, true)}{field('expected', c.expected, expected, setExpected, true)}</>}
          <Text style={s.hint}>{c.environment}: {environment}</Text>
          <View style={s.consent}><Switch accessibilityLabel={c.consent + ', ' + c.validation.required} accessibilityHint={c.validation.consent} value={consent} onValueChange={v => { setConsent(v); setTouched(previous => ({ ...previous, consent: true })); setError(''); }} /><Text style={[s.body, { flex: 1 }]}>{c.consent} *</Text></View>
          {(attempted || touched.consent) && validation.consent && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{c.validation.consent}</Text>}
          <ReportButton label={c.review} onPress={review} busy={busy} />
        </View>}
        {error !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        {busy && <ActivityIndicator color={C.accent} />}
        <View style={s.card}><Text style={s.heading}>{c.records}</Text><Text style={s.body}>{c.lookup}</Text>
          <ReportButton label={busy ? c.checking : c.refresh} onPress={() => void run(async () => setRecords(await listReports()))} busy={busy} secondary />
          {records?.length === 0 && <Text style={s.body}>{c.empty}</Text>}
          {records?.map(r => <View style={s.record} key={r.id}>
            <Text selectable style={s.label}>{r.id}</Text><Text style={s.body}>{r.title}</Text>
            <Text style={s.body}>{c.statuses[r.status]} · {new Date(r.updated_at * 1000).toLocaleString(i18n.language)}</Text>
          </View>)}
        </View>
      </RoseScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  page: { width: '100%', maxWidth: 850, alignSelf: 'center', padding: 24, paddingTop: Platform.OS === 'web' ? 110 : 8, paddingBottom: 110, gap: 18 },
  eyebrow: { color: C.accent, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  heading: { color: C.text, fontWeight: '800', fontSize: 24 },
  body: { color: C.muted, fontSize: 14, lineHeight: 23 }, label: { color: C.text, fontSize: 15 }, hint: { color: C.muted, fontSize: 12 },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, gap: 18 },
  field: { gap: 8 }, input: { color: C.text, backgroundColor: C.background, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 48 },
  invalidInput: { borderColor: '#FFB8BE' },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 44, justifyContent: 'center' }, selected: { backgroundColor: C.selected, borderColor: C.accent },
  button: { backgroundColor: C.primary, borderRadius: 12, padding: 15, minHeight: 48, alignItems: 'center' }, secondary: { backgroundColor: C.surfaceAlt }, buttonText: { color: C.text, fontWeight: '700', fontSize: 15 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12 }, error: { color: '#FFB8BE', lineHeight: 23 }, record: { borderTopColor: C.border, borderTopWidth: 1, paddingTop: 14, gap: 8 },
});
