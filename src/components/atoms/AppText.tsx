import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { colors, type } from '../../theme';

type Props = TextProps & { variant?: keyof typeof type; color?: string; style?: StyleProp<TextStyle> };
export const AppText = ({ variant = 'body', color = colors.text, style, ...rest }: Props) => (
  <Text {...rest} style={[type[variant], { color }, style]} />
);
