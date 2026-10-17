import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FanColors } from '@/constants/fan-theme';
import { buildHistorySummary, type HistoryPoint } from '@/services/history-summary';
import AnimatedNumber from '@/components/animated-number';
import ChartReveal from '@/components/chart-reveal';

type Props = {
  title: string;
  points: HistoryPoint[];
  emptyLabel: string;
  formatNumber: (value: number) => string;
  formatTime: (timestamp: number) => string;
  timeZone: string;
  approximate?: boolean;
};

const copy = {
  zh: {
    first: '起點快照', latest: '最新可用快照', net: '期間淨增減',
    chart: '快照區間增減', partial: '日內比較', between: '跨日期比較',
    hint: '每柱比較實際起訖快照，不是每日完整增量；缺少的日期不補零。點柱可查看時間，左右滑動可看更多。',
    one: '持續累積中：至少需要兩筆有效快照才能比較。',
    flat: '這段期間所有已記錄的數值相同，尚未觀察到變化。',
    approx: '訂閱數是 YouTube 公開約數；增減也是約數，未變動不代表沒有新增訂閱。',
    missing: '部分快照缺少數值；無法比較的區間以「—」顯示。',
    axis: '零線上方為增加，下方為減少；短橫線表示增減為 0。',
    samples: '已收集快照', unknown: '無法比較', zero: '無變化',
  },
  en: {
    first: 'First snapshot', latest: 'Latest available', net: 'Net change',
    chart: 'Change between snapshots', partial: 'Within one day', between: 'Between recorded days',
    hint: 'Bars compare actual snapshot endpoints, not complete daily gains. Missing dates are not filled with zero. Select a bar for times; scroll sideways for more.',
    one: 'Collecting history: at least two valid snapshots are needed.',
    flat: 'All recorded values in this period are identical. No change has been observed.',
    approx: 'YouTube subscriber counts and their changes are approximate. An unchanged count does not mean no new subscribers.',
    missing: 'Some snapshot values are missing. Unavailable comparisons are marked —.',
    axis: 'Above zero: increase. Below zero: decrease. A short dash indicates zero change.',
    samples: 'Snapshots collected', unknown: 'Unavailable comparison', zero: 'Unchanged',
  },
  ja: {
    first: '開始時の記録', latest: '最新の取得可能な記録', net: '期間の純増減',
    chart: '記録間の増減', partial: '同日内の比較', between: '記録日の間の比較',
    hint: '各棒は実際の記録時刻間の比較で、完全な日次増減ではありません。欠けた日を0で補完しません。棒を選択すると時刻を確認できます。横にスクロールできます。',
    one: '記録を蓄積中です。比較には有効な記録が2件以上必要です。',
    flat: 'この期間の記録値はすべて同じで、変化はまだ観測されていません。',
    approx: '登録者数と増減はYouTubeの公開概数です。変化がなくても新規登録がないとは限りません。',
    missing: '一部の値が欠けています。比較できない区間は「—」で表示します。',
    axis: '0より上は増加、下は減少、短い横線は増減0を示します。',
    samples: '収集済みの記録', unknown: '比較不可', zero: '変化なし',
  },
};

export default function HistoryChangeChart({
  title, points, emptyLabel, formatNumber, formatTime, timeZone, approximate = false,
}: Props) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const text = language.startsWith('zh') ? copy.zh : language.startsWith('ja') ? copy.ja : copy.en;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const summary = buildHistorySummary(points, timeZone);
  const selected = summary.intervals.find((item) => item.id === selectedId)
    ?? summary.intervals[summary.intervals.length - 1];
  const maximum = summary.intervals.reduce((max, item) => Math.max(max, Math.abs(item.delta ?? 0)), 0);
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
  const formatDay = (timestamp: number) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: 'numeric', day: 'numeric', timeZone }).format(timestamp);
    } catch { return formatTime(timestamp); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.summary}>
        {[
          { label: text.first, point: summary.first },
          { label: text.latest, point: summary.latest },
        ].map(({ label, point }) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.muted}>{label}</Text>
            <AnimatedNumber value={point?.value ?? null}
              formatNumber={(value) => value === null ? emptyLabel : formatNumber(value)} style={styles.number} />
            {point && <Text style={styles.small}>{formatTime(point.timestamp)}</Text>}
          </View>
        ))}
        <View style={styles.stat}>
          <Text style={styles.muted}>{text.net}{approximate ? ' ≈' : ''}</Text>
          <Text style={[styles.net, summary.net !== null && summary.net < 0 && styles.negative]}>
            {summary.net === null ? '—' : signed(summary.net)}
          </Text>
          {summary.net === 0 && <Text style={styles.small}>{text.zero}</Text>}
        </View>
      </View>
      <Text style={styles.small}>{text.samples}: {formatNumber(summary.sampleCount)}</Text>
      {approximate && <Text style={styles.muted}>{text.approx}</Text>}
      {summary.missingCount > 0 && <Text style={styles.muted}>{text.missing}</Text>}
      {summary.net === null && <Text style={styles.muted}>{text.one}</Text>}
      {summary.unchanged && <Text style={styles.notice}>{text.flat}</Text>}

      {summary.intervals.length > 0 && (
        <>
          <Text style={styles.heading}>{text.chart}</Text>
          <Text style={styles.small}>{text.hint}</Text>
          <ChartReveal>
            <View style={styles.plot}>
              <View style={styles.axis}>
                <Text style={styles.small}>{maximum > 0 ? `+${formatNumber(maximum)}` : ''}</Text>
                <Text style={styles.small}>0</Text>
                <Text style={styles.small}>{maximum > 0 ? `−${formatNumber(maximum)}` : ''}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator
                style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8 }}>
                <View style={styles.bars}>
                  <View style={styles.zeroLine} />
                  {summary.intervals.map((item) => {
                    const delta = item.delta;
                    const height = delta === null || maximum === 0 ? 0 : Math.abs(delta) / maximum * 60;
                    const chosen = item.id === selected?.id;
                    return (
                      <Pressable key={item.id} accessibilityRole="button"
                        accessibilityState={{ selected: chosen }}
                        accessibilityLabel={`${formatTime(item.from.timestamp)} → ${formatTime(item.to.timestamp)}: ${delta === null ? text.unknown : signed(delta)}`}
                        onPress={() => setSelectedId(item.id)}
                        style={[styles.slot, chosen && styles.chosen]}>
                        <View style={styles.track}>
                          {delta === null ? <Text style={styles.unavailable}>—</Text>
                            : delta === 0 ? <View style={styles.zeroMark} />
                            : <View style={{ position: 'absolute', left: 16, width: 24, height,
                              top: delta > 0 ? 70 - height : 70,
                              backgroundColor: delta < 0 ? '#FF9F9F' : FanColors.accent,
                              borderRadius: 4 }} />}
                        </View>
                        <Text style={styles.date}>{formatDay(item.to.timestamp)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </ChartReveal>
          <Text style={styles.small}>{text.axis}</Text>
          {selected && (
            <View style={styles.detail} accessibilityLiveRegion="polite">
              <Text style={styles.muted}>{selected.kind === 'within-day' ? text.partial : text.between}</Text>
              <Text style={styles.muted}>{formatTime(selected.from.timestamp)} → {formatTime(selected.to.timestamp)}</Text>
              <Text style={[styles.net, selected.delta !== null && selected.delta < 0 && styles.negative]}>
                {selected.delta === null ? text.unknown : `${approximate ? '≈ ' : ''}${signed(selected.delta)}`}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: FanColors.surface, borderRadius: 20, padding: 20, gap: 14 },
  heading: { color: FanColors.text, fontSize: 17, fontWeight: '700' },
  muted: { color: FanColors.muted, fontSize: 13, lineHeight: 21 },
  small: { color: FanColors.muted, fontSize: 11, lineHeight: 17 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: 6,
    backgroundColor: FanColors.surfaceAlt, borderRadius: 12, padding: 14 },
  number: { color: FanColors.text, fontSize: 20, fontWeight: '700' },
  net: { color: FanColors.accent, fontSize: 22, fontWeight: '800' },
  negative: { color: '#FF9F9F' },
  notice: { color: FanColors.accent, backgroundColor: FanColors.surfaceAlt,
    borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 21 },
  plot: { flexDirection: 'row', gap: 8 },
  axis: { width: 64, height: 140, justifyContent: 'space-between' },
  bars: { flexDirection: 'row', position: 'relative', minWidth: 56 },
  zeroLine: { position: 'absolute', left: 0, right: 0, top: 70,
    borderTopWidth: 1, borderTopColor: FanColors.border },
  slot: { width: 56, borderRadius: 8, paddingBottom: 6 },
  chosen: { backgroundColor: FanColors.selected },
  track: { height: 140, position: 'relative' },
  zeroMark: { position: 'absolute', top: 69, left: 20, width: 16,
    height: 3, backgroundColor: FanColors.accent, borderRadius: 2 },
  unavailable: { position: 'absolute', top: 60, alignSelf: 'center', color: FanColors.muted },
  date: { color: FanColors.muted, fontSize: 10, textAlign: 'center' },
  detail: { padding: 14, gap: 6, borderRadius: 12, backgroundColor: FanColors.surfaceAlt },
});
