// ============================================================
// RadialGauge — l'élément signature de l'app.
//
// Plutôt qu'une jauge générique, cet anneau visualise directement le
// concept central de RX35 : une mesure comparée à un SEUIL DE DÉCISION.
// L'arc est divisé en deux zones (sous le seuil / au-dessus), et le
// curseur montre où se situe la valeur actuelle — la même logique que le
// firmware utilise pour décider d'irriguer ou non.
// ============================================================
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography } from "@/theme/tokens";

interface Props {
  value: number; // 0-100
  threshold: number; // 0-100
  label: string;
  unit?: string;
  size?: number;
  belowThresholdMeansAction?: boolean; // true: sous le seuil = action nécessaire (ex: irriguer)
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// La jauge couvre 270° (de -135° à +135°) pour laisser un espace lisible en bas.
const START_ANGLE = -135;
const END_ANGLE = 135;
const SWEEP = END_ANGLE - START_ANGLE;

export function RadialGauge({
  value,
  threshold,
  label,
  unit = "%",
  size = 150,
  belowThresholdMeansAction = true,
}: Props) {
  const { colors } = useAppTheme();
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;

  const clampedValue = Math.max(0, Math.min(100, value));
  const clampedThreshold = Math.max(0, Math.min(100, threshold));

  const valueAngle = START_ANGLE + (clampedValue / 100) * SWEEP;
  const thresholdAngle = START_ANGLE + (clampedThreshold / 100) * SWEEP;

  const needsAction = belowThresholdMeansAction ? value < threshold : value > threshold;
  const activeColor = needsAction ? colors.accent : colors.success;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {/* Piste de fond */}
        <Path
          d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)}
          stroke={colors.border}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
        {/* Valeur actuelle */}
        <Path
          d={arcPath(cx, cy, r, START_ANGLE, valueAngle)}
          stroke={activeColor}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
        {/* Marqueur de seuil */}
        <Circle
          cx={polarToCartesian(cx, cy, r, thresholdAngle).x}
          cy={polarToCartesian(cx, cy, r, thresholdAngle).y}
          r={5}
          fill={colors.text}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject as any}>
        <View style={styles.centerContent}>
          <Text style={[styles.value, { color: colors.text, fontFamily: typography.display }]}>
            {Math.round(clampedValue)}
            <Text style={[styles.unit, { color: colors.textMuted, fontFamily: typography.body }]}>{unit}</Text>
          </Text>
          <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.body }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  value: {
    fontSize: 30,
    lineHeight: 34,
  },
  unit: {
    fontSize: 14,
  },
  label: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
    paddingHorizontal: 10,
  },
});
