import { useEffect, useState, type ReactNode } from 'react';
import {
    AccessibilityInfo,
    Animated,
    StyleSheet,
    View,
} from 'react-native';

type Props = {
    children: ReactNode;
    height?: number;
};

export default function ChartReveal({
    children,
    height = 180,
}: Props) {
    const [width, setWidth] = useState(0);
    const [progress] = useState(() => new Animated.Value(0));

    useEffect(() => {
        if (width <= 0) return;

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
    }, [width, progress]);

    return (
        <View
            style={[styles.container, { height }]}
            onLayout={(event) => {
                const measuredWidth = event.nativeEvent.layout.width;
                if (measuredWidth > 0) setWidth(measuredWidth);
            }}
        >
            {width > 0 && (
                <Animated.View
                    style={{
                        height,
                        overflow: 'hidden',
                        width: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, width],
                        }),
                    }}
                >
                    <View style={{ width, height }}>{children}</View>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: '100%', overflow: 'hidden' },
});