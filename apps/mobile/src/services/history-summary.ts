export type HistoryPoint = { timestamp: number; value: number | null };
export type HistoryInterval = {
  id: string;
  from: HistoryPoint;
  to: HistoryPoint;
  delta: number | null;
  kind: 'within-day' | 'between-days';
};

export function buildHistorySummary(points: HistoryPoint[], timeZone: string) {
  // Preserve null observations so missing values cannot become zero changes.
  const ordered = [...new Map(points
    .filter((point) => Number.isFinite(point.timestamp))
    .map((point) => [point.timestamp, {
      timestamp: point.timestamp,
      value: point.value !== null && Number.isSafeInteger(point.value) && point.value >= 0
        ? point.value : null,
    }])).values()].sort((a, b) => a.timestamp - b.timestamp);

  let dayFormat: Intl.DateTimeFormat;
  try {
    dayFormat = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
    });
  } catch {
    dayFormat = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC',
    });
  }
  const groups = new Map<string, HistoryPoint[]>();
  for (const point of ordered) {
    const key = dayFormat.format(point.timestamp);
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }
  const days = [...groups.values()];
  const available = ordered.filter((point): point is HistoryPoint & { value: number } => point.value !== null);
  const first = available[0] ?? null;
  const latest = available[available.length - 1] ?? null;
  const intervals: HistoryInterval[] = [];

  // The first recorded day is partial. Show its actual intraday observation span.
  const firstDay = days[0];
  if (firstDay && firstDay.length > 1) {
    const from = firstDay[0];
    const to = firstDay[firstDay.length - 1];
    intervals.push({
      id: `${from.timestamp}:${to.timestamp}`, from, to, kind: 'within-day',
      delta: firstDay.some((point) => point.value === null) ? null : to.value! - from.value!,
    });
  }
  // Subsequent bars compare the final observation of adjacent recorded days.
  // They may span multiple calendar days; the UI displays both endpoints.
  for (let index = 1; index < days.length; index++) {
    const previous = days[index - 1];
    const current = days[index];
    const from = previous[previous.length - 1];
    const to = current[current.length - 1];
    intervals.push({
      id: `${from.timestamp}:${to.timestamp}`, from, to, kind: 'between-days',
      delta: from.value === null || current.some((point) => point.value === null)
        ? null : to.value! - from.value,
    });
  }
  return {
    first, latest, intervals,
    sampleCount: ordered.length,
    missingCount: ordered.filter((point) => point.value === null).length,
    net: first && latest && first.timestamp !== latest.timestamp ? latest.value - first.value : null,
    unchanged: available.length > 1 && available.every((point) => point.value === available[0].value),
  };
}
