import { useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Text,
    type StyleProp,
    type TextStyle,
} from 'react-native';

type Props = {
    value: number | null;
    formatNumber: (value: number | null) => string;
    prefix?: string;
    style?: StyleProp<TextStyle>;
};

export default function AnimatedNumber({
    value,
    formatNumber,
    prefix = '',
    style,
}: Props) {
    const [displayed, setDisplayed] = useState(0);
    const current = useRef(0);

    useEffect(() => {
        if (value === null || value === current.current) return;

        const from = current.current;
        let active = true;
        let frame: number | null = null;
        let startedAt: number | null = null;

        function finish() {
            if (!active || value === null) return;
            current.current = value;
            setDisplayed(value);
        }

        function tick(timestamp: number) {
            if (!active || value === null) return;
            if (startedAt === null) {
                startedAt = timestamp;
            }

            const progress = Math.min(1, (timestamp - startedAt) / 1000);
            const eased = 1 - Math.pow(1 - progress, 3);
            const next = Math.round(from + (value - from) * eased);

            current.current = next;
            setDisplayed(next);

            if (progress < 1) {
                frame = requestAnimationFrame(tick);
            } else {
                finish();
            }
        }

        void AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotion) => {
                if (!active) return;
                if (reduceMotion) {
                    finish();
                } else {
                    frame = requestAnimationFrame(tick);
                }
            })
            .catch(finish);

        return () => {
            active = false;
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [value]);

    return (
        <Text
            style={[style, { fontVariant: ['tabular-nums'] }]}
            accessible
            accessibilityLabel={`${prefix}${formatNumber(value)}`}
        >
            {prefix}{formatNumber(value === null ? null : displayed)}
        </Text>
    );
}