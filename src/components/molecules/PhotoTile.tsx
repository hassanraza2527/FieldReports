import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';
import { AppText } from '../atoms/AppText';

export const PhotoTile = ({ uri, size = 96, onRemove }: { uri: string; size?: number; onRemove?: () => void }) => (
  <View style={{ width: size, height: size }}>
    <Image source={{ uri }} style={[styles.img, { width: size, height: size }]} resizeMode="cover" />
    {onRemove ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={12} onPress={onRemove} style={styles.x}>
        <AppText variant="caption" color="#fff">✕</AppText>
      </Pressable>
    ) : null}
  </View>
);
const styles = StyleSheet.create({
  img: { borderRadius: radius.sm, backgroundColor: colors.border },
  x: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' },
});
