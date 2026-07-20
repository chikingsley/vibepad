import React, { useCallback, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  type PointerEvent,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type {
  FeedbackPoint,
  FeedbackSelectionPoint,
  FeedbackStroke,
  PreviewInteractionMode,
} from "@/features/preview/preview-interaction";

interface PointEvent {
  readonly pointerType: string;
  readonly pressure: number;
  readonly x: number;
  readonly y: number;
}

interface ViewportSize {
  readonly height: number;
  readonly width: number;
}

interface FeedbackOverlayProps {
  readonly mode: PreviewInteractionMode;
  readonly onSelect: (point: FeedbackPoint) => void;
  readonly onStroke: (points: readonly FeedbackPoint[]) => void;
  readonly selections: readonly FeedbackSelectionPoint[];
  readonly strokes: readonly FeedbackStroke[];
}

const pointerName = (pointerType: string): FeedbackPoint["pointer"] => {
  if (pointerType === "pen" || pointerType === "stylus") {
    return "pencil";
  }
  if (pointerType === "touch") {
    return "touch";
  }
  if (pointerType === "mouse") {
    return "mouse";
  }
  return "unknown";
};

const normalizedPoint = (
  event: PointEvent,
  viewport: ViewportSize
): FeedbackPoint => ({
  pointer: pointerName(event.pointerType),
  pressure: event.pressure || 0.5,
  x: viewport.width ? event.x / viewport.width : 0,
  y: viewport.height ? event.y / viewport.height : 0,
});

const pathForPoints = (
  points: readonly FeedbackPoint[],
  viewport: ViewportSize
) =>
  points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${point.x * viewport.width} ${point.y * viewport.height}`;
    })
    .join(" ");

export function FeedbackOverlay({
  mode,
  onSelect,
  onStroke,
  selections,
  strokes,
}: FeedbackOverlayProps) {
  const viewportRef = useRef<ViewportSize>({ height: 0, width: 0 });
  const activeStrokeRef = useRef<readonly FeedbackPoint[]>([]);
  const activePointerIdRef = useRef<number | undefined>(undefined);
  const [activeStroke, setActiveStroke] = useState<readonly FeedbackPoint[]>(
    []
  );
  const [viewport, setViewport] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextViewport = {
      height: event.nativeEvent.layout.height,
      width: event.nativeEvent.layout.width,
    };
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }, []);

  const pointFromEvent = useCallback(
    (event: PointerEvent) =>
      normalizedPoint(
        {
          pointerType: event.nativeEvent.pointerType,
          pressure: event.nativeEvent.pressure,
          x: event.nativeEvent.offsetX,
          y: event.nativeEvent.offsetY,
        },
        viewportRef.current
      ),
    []
  );

  const pointFromResponderEvent = useCallback(
    (event: GestureResponderEvent) => {
      const { force, locationX, locationY } = event.nativeEvent;
      return normalizedPoint(
        {
          pointerType: typeof force === "number" && force > 0 ? "pen" : "touch",
          pressure: force ?? 0.5,
          x: locationX,
          y: locationY,
        },
        viewportRef.current
      );
    },
    []
  );

  const clearActiveStroke = useCallback(() => {
    activePointerIdRef.current = undefined;
    activeStrokeRef.current = [];
    setActiveStroke([]);
  }, []);

  const beginStroke = useCallback(
    (point: FeedbackPoint, pointerId: number | undefined) => {
      activePointerIdRef.current = pointerId;
      activeStrokeRef.current = [point];
      setActiveStroke([point]);
    },
    []
  );

  const appendStrokePoint = useCallback((point: FeedbackPoint) => {
    const { current } = activeStrokeRef;
    const previous = current.at(-1);
    if (
      previous &&
      Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) < 0.0015
    ) {
      return;
    }
    const next = [...current, point];
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }, []);

  const finishStroke = useCallback(
    (point: FeedbackPoint) => {
      appendStrokePoint(point);
      const completed = activeStrokeRef.current;
      if (completed.length > 1) {
        onStroke(completed);
      }
      clearActiveStroke();
    },
    [appendStrokePoint, clearActiveStroke, onStroke]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      if (mode === "browse") {
        return;
      }
      const point = pointFromEvent(event);
      if (mode === "select") {
        onSelect(point);
        return;
      }
      beginStroke(point, event.nativeEvent.pointerId);
    },
    [beginStroke, mode, onSelect, pointFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (
        mode !== "draw" ||
        activePointerIdRef.current !== event.nativeEvent.pointerId
      ) {
        return;
      }
      appendStrokePoint(pointFromEvent(event));
    },
    [appendStrokePoint, mode, pointFromEvent]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (
        mode !== "draw" ||
        activePointerIdRef.current !== event.nativeEvent.pointerId
      ) {
        return;
      }
      finishStroke(pointFromEvent(event));
    },
    [finishStroke, mode, pointFromEvent]
  );

  const handleResponderGrant = useCallback(
    (event: GestureResponderEvent) => {
      const point = pointFromResponderEvent(event);
      if (mode === "select") {
        onSelect(point);
        return;
      }
      if (mode === "draw") {
        beginStroke(point, undefined);
      }
    },
    [beginStroke, mode, onSelect, pointFromResponderEvent]
  );
  const handleResponderMove = useCallback(
    (event: GestureResponderEvent) => {
      if (mode === "draw") {
        appendStrokePoint(pointFromResponderEvent(event));
      }
    },
    [appendStrokePoint, mode, pointFromResponderEvent]
  );
  const handleResponderRelease = useCallback(
    (event: GestureResponderEvent) => {
      if (mode === "draw") {
        finishStroke(pointFromResponderEvent(event));
      }
    },
    [finishStroke, mode, pointFromResponderEvent]
  );
  const shouldSetResponder = useCallback(() => mode !== "browse", [mode]);
  const shouldSetMoveResponder = useCallback(() => mode === "draw", [mode]);

  return (
    <View
      collapsable={false}
      onLayout={handleLayout}
      onMoveShouldSetResponder={
        Platform.OS === "web" ? undefined : shouldSetMoveResponder
      }
      onPointerCancel={Platform.OS === "web" ? clearActiveStroke : undefined}
      onPointerDown={Platform.OS === "web" ? handlePointerDown : undefined}
      onPointerMove={Platform.OS === "web" ? handlePointerMove : undefined}
      onPointerUp={Platform.OS === "web" ? handlePointerUp : undefined}
      onResponderGrant={
        Platform.OS === "web" ? undefined : handleResponderGrant
      }
      onResponderMove={Platform.OS === "web" ? undefined : handleResponderMove}
      onResponderRelease={
        Platform.OS === "web" ? undefined : handleResponderRelease
      }
      onResponderTerminate={
        Platform.OS === "web" ? undefined : clearActiveStroke
      }
      onStartShouldSetResponder={
        Platform.OS === "web" ? undefined : shouldSetResponder
      }
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { pointerEvents: mode === "browse" ? "none" : "auto" },
      ]}
      testID="preview-feedback-overlay"
    >
      <Svg
        height={viewport.height}
        style={{ pointerEvents: "none" }}
        width={viewport.width}
      >
        {strokes.map((stroke) => (
          <Path
            d={pathForPoints(stroke.points, viewport)}
            fill="none"
            key={stroke.id}
            stroke="#ef4444"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ))}
        {activeStroke.length > 1 ? (
          <Path
            d={pathForPoints(activeStroke, viewport)}
            fill="none"
            stroke="#ef4444"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}
        {selections.map((selection) => (
          <React.Fragment key={selection.id}>
            {selection.rect ? (
              <Rect
                fill="rgba(59, 130, 246, 0.12)"
                height={selection.rect.height * viewport.height}
                rx={5}
                stroke="#3b82f6"
                strokeDasharray="5 3"
                strokeWidth={2}
                width={selection.rect.width * viewport.width}
                x={selection.rect.x * viewport.width}
                y={selection.rect.y * viewport.height}
              />
            ) : null}
            <Circle
              cx={selection.x * viewport.width}
              cy={selection.y * viewport.height}
              fill="rgba(59, 130, 246, 0.18)"
              r={12}
              stroke="#3b82f6"
              strokeWidth={2}
            />
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    elevation: 1,
    zIndex: 1,
  },
});
