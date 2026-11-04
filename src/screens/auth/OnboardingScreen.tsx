import React, { useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../../components/atoms/AppText';
import { Button } from '../../components/atoms/Button';
import { colors, radius, spacing } from '../../theme';

const SLIDES = [
  { id: '1', glyph: '📝', title: 'Write it down', text: 'Describe what you found in the field. Your report is saved on the phone the moment you tap save.' },
  { id: '2', glyph: '📷', title: 'Add photos', text: 'Attach 1 to 5 photos from the camera or gallery. They are shrunk automatically so they upload fast.' },
  { id: '3', glyph: '📶', title: 'Works offline', text: 'No signal? No problem. Reports upload by themselves when the connection is back, and never twice.' },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const next = () => (last ? onDone() : list.current?.scrollToIndex({ index: index + 1, animated: true }));

  return (
    <SafeAreaView style={styles.s}>
      <View style={styles.top}>
        {!last ? <AppText variant="label" color={colors.muted} onPress={onDone} accessibilityRole="button">Skip</AppText> : null}
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={i => i.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.circle}><AppText style={styles.glyph}>{item.glyph}</AppText></View>
            <AppText variant="title" style={styles.center}>{item.title}</AppText>
            <AppText color={colors.muted} style={styles.center}>{item.text}</AppText>
          </View>
        )}
      />
      <View style={styles.dots}>
        {SLIDES.map((s, i) => <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />)}
      </View>
      <View style={styles.bottom}>
        <Button title={last ? 'Get started' : 'Next'} onPress={next} />
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  s: { flex: 1, backgroundColor: colors.bg },
  top: { height: 48, paddingHorizontal: spacing.xl, alignItems: 'flex-end', justifyContent: 'center' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl * 1.5, gap: spacing.lg },
  circle: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  glyph: { fontSize: 64, lineHeight: 80 },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotOn: { width: 24, backgroundColor: colors.primary },
  bottom: { padding: spacing.xl },
});
