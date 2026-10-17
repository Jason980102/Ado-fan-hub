import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useState } from 'react';
import ChartReveal from '@/components/chart-reveal';
import AnimatedNumber from '@/components/animated-number';

export type HistoryChartPoint = {
    timestamp: number;
    value: number | null;
};

type Props = {
    title: string;
    points: HistoryChartPoint[];
    emptyLabel: string;
    formatNumber: (value: number) => string;
    formatTime: (timestamp: number) => string;
};

export default function HistoryLineChart({
    title,
    points,
    emptyLabel,
    formatNumber,
    formatTime,
}: Props) {
    const [plotWidth, setPlotWidth] = useState(300);
    const values = points.flatMap((point) =>
        point.value !== null && Number.isFinite(point.value)
            ? [point.value]
            : []
    );

    if (values.length === 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.label}>{emptyLabel}</Text>
            </View>
        );
    }

    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = Math.max(1, Math.ceil((maximum - minimum) * 0.1));
    const lower = Math.max(0, minimum - padding);
    const upper = maximum + padding;

    const firstTime = points[0].timestamp;
    const lastTime = points[points.length - 1].timestamp;
    const x = (timestamp: number) =>
        lastTime === firstTime
            ? plotWidth / 2
            : 12 + ((timestamp - firstTime) / (lastTime - firstTime))
            * (plotWidth - 24);
    const y = (value: number) =>
        168 - ((value - lower) / (upper - lower)) * 156;

    let path = '';
    let connected = false;
    const dots: { x: number; y: number; key: number }[] = [];

    for (const point of points) {
        if (point.value === null || !Number.isFinite(point.value)) {
            connected = false;
            continue;
        }

        const px = x(point.timestamp);
        const py = y(point.value);
        path += `${connected ? 'L' : 'M'} ${px} ${py} `;
        connected = true;
        dots.push({ x: px, y: py, key: point.timestamp });
    }

    return (
        <View
            style={styles.card}
            accessible
            accessibilityLabel={
                `${title}: ${formatNumber(minimum)} – ${formatNumber(maximum)}`
            }
        >
            <Text style={styles.title}>{title}</Text>
            <AnimatedNumber
                value={upper}
                formatNumber={(value) =>
                    value === null ? emptyLabel : formatNumber(value)
                }
                style={styles.axis}
            />
            <ChartReveal>
                <View
                    onLayout={(event) => {
                        const width = event.nativeEvent.layout.width;
                        if (width > 24) setPlotWidth(width);
                    }}
                >
                    <Svg
                        width="100%"
                        height={180}
                        viewBox={`0 0 ${plotWidth} 180`}
                    >
                        {[12, 90, 168].map((position) => (
                            <Line
                                key={position}
                                x1={12}
                                x2={plotWidth - 12}
                                y1={position}
                                y2={position}
                                stroke="#393345"
                                strokeDasharray="4 6"
                            />
                        ))}
                        <Path
                            d={path}
                            fill="none"
                            stroke="#C8B4FF"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        {dots.length <= 60 && dots.map((dot) => (
                            <Circle
                                key={dot.key}
                                cx={dot.x}
                                cy={dot.y}
                                r={4}
                                fill="#C8B4FF"
                            />
                        ))}
                    </Svg>
                </View>
            </ChartReveal>
            <Text style={styles.axis}>{formatNumber(lower)}</Text>
            <View style={styles.dates}>
                <Text style={styles.date}>{formatTime(firstTime)}</Text>
                {lastTime !== firstTime && (
                    <Text style={[styles.date, styles.endDate]}>
                        {formatTime(lastTime)}
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#191923',
        borderRadius: 20,
        padding: 20,
        gap: 8,
    },
    title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    label: { color: '#AAA6BC', fontSize: 14 },
    axis: { color: '#AAA6BC', fontSize: 12 },
    dates: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    date: { color: '#AAA6BC', fontSize: 12, flex: 1 },
    endDate: { textAlign: 'right' },
});