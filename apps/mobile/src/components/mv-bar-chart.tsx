import {
    AccessibilityInfo,
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import AnimatedNumber from '@/components/animated-number';
import type { AnalyticsResponse } from '@/services/analytics-api';
import { useEffect, useState } from 'react';

type Video = AnalyticsResponse['videos'][number];
type RankedVideo = Video & { view_count: number };

type Props = {
    videos: Video[];
    title: string;
    emptyLabel: string;
    viewsLabel: string;
    formatNumber: (value: number) => string;
    onSelect: (id: string) => void;
};

function AnimatedBar({ percentage }: { percentage: number }) {
    const [progress] = useState(() => new Animated.Value(0));
    useEffect(() => {
        let active = true;
        progress.setValue(0);

        const animation = Animated.timing(progress, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
        });

        void AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotion) => {
                if (!active) return;
                if (reduceMotion) {
                    progress.setValue(1);
                } else {
                    animation.start();
                }
            })
            .catch(() => {
                if (active) progress.setValue(1);
            });

        return () => {
            active = false;
            animation.stop();
        };
    }, [percentage, progress]);

    return (
        <Animated.View
            style={[
                styles.bar,
                {
                    width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', `${percentage}%`],
                    }),
                },
            ]}
        />
    );
}

export default function MvBarChart({
    videos,
    title,
    emptyLabel,
    viewsLabel,
    formatNumber,
    onSelect,
}: Props) {
    const ranked = videos
        .filter((video): video is RankedVideo =>
            typeof video.view_count === 'number' &&
            Number.isSafeInteger(video.view_count) &&
            video.view_count >= 0
        )
        .sort((a, b) =>
            b.view_count - a.view_count || a.id.localeCompare(b.id)
        )
        .slice(0, 10);

    const maximum = ranked[0]?.view_count ?? 0;

    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{title}</Text>
            {ranked.length === 0 && (
                <Text style={styles.muted}>{emptyLabel}</Text>
            )}
            {ranked.map((video, index) => (
                <Pressable
                    key={video.id}
                    accessibilityRole="link"
                    accessibilityLabel={
                        `${index + 1}. ${video.title}, ` +
                        `${formatNumber(video.view_count)} ${viewsLabel}`
                    }
                    onPress={() => onSelect(video.id)}
                    style={({ pressed }) => [
                        styles.row,
                        pressed && styles.pressed,
                    ]}
                >
                    <View style={styles.labels}>
                        <Text style={styles.rank}>{index + 1}</Text>
                        <Text style={styles.song}>{video.title}</Text>
                    </View>
                    <AnimatedNumber
                        value={video.view_count}
                        formatNumber={(value) =>
                            value === null ? emptyLabel : formatNumber(value)
                        }
                        style={styles.count}
                    />
                    <View style={styles.track}>
                        <AnimatedBar
                            percentage={
                                maximum > 0
                                    ? (video.view_count / maximum) * 100
                                    : 0
                            }
                        />
                    </View>
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#191923',
        borderRadius: 20,
        padding: 20,
        gap: 20,
    },
    heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    muted: { color: '#AAA6BC', fontSize: 14 },
    row: { gap: 8, paddingVertical: 4 },
    labels: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    rank: {
        color: '#C8B4FF',
        fontSize: 16,
        fontWeight: '800',
        minWidth: 24,
    },
    song: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, flex: 1 },
    count: {
        color: '#C8B4FF',
        fontSize: 14,
        textAlign: 'right',
        fontVariant: ['tabular-nums'],
    },
    track: {
        height: 16,
        backgroundColor: '#302A3E',
        borderRadius: 8,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        backgroundColor: '#B59AFF',
        borderRadius: 8,
    },
    pressed: { opacity: 0.7 },
});