import {
  Canvas,
  Circle,
  Path,
  RoundedRect,
  Skia,
  type SkPathBuilder,
} from "@shopify/react-native-skia";
import { Fragment, useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  PointerType,
} from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  normalizeFeedbackPoint,
  shouldAppendFeedbackPoint,
} from "@/features/preview/feedback-points";
import type {
  FeedbackPoint,
  FeedbackSelectionPoint,
  FeedbackStroke,
  PreviewInteractionMode,
} from "@/features/preview/preview-interaction";

interface PointEvent {
  readonly pointerType: PointerType;
  readonly pressure: number | undefined;
  readonly x: number;
  readonly y: number;
}

interface ViewportSize {
  readonly height: number;
  readonly width: number;
}

export interface FeedbackOverlayProps {
  readonly mode: PreviewInteractionMode;
  readonly onSelect: (point: FeedbackPoint) => void;
  readonly onStroke: (points: readonly FeedbackPoint[]) => void;
  readonly selections: readonly FeedbackSelectionPoint[];
  readonly strokes: readonly FeedbackStroke[];
}

const pointerName = (pointerType: PointerType): FeedbackPoint["pointer"] => {
  "worklet";
  if (pointerType === PointerType.STYLUS) {
    return "pencil";
  }
  if (pointerType === PointerType.TOUCH) {
    return "touch";
  }
  if (pointerType === PointerType.MOUSE) {
    return "mouse";
  }
  return "unknown";
};

const normalizedPoint = (
  event: PointEvent,
  viewport: ViewportSize
): FeedbackPoint => {
  "worklet";
  return normalizeFeedbackPoint(
    {
      pointer: pointerName(event.pointerType),
      pressure: event.pressure,
      x: event.x,
      y: event.y,
    },
    viewport
  );
};

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

function FeedbackOverlayCanvas({
  mode,
  onSelect,
  onStroke,
  selections,
  strokes,
}: FeedbackOverlayProps) {
  const [viewport, setViewport] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });
  const viewportSize = useSharedValue<ViewportSize>({ height: 0, width: 0 });
  const activePoints = useSharedValue<FeedbackPoint[]>([]);
  const activePathBuilder = useSharedValue<SkPathBuilder>(() =>
    Skia.PathBuilder.Make()
  );
  const activePath = useDerivedValue(() => activePathBuilder.get().build());

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextViewport = {
        height: event.nativeEvent.layout.height,
        width: event.nativeEvent.layout.width,
      };
      viewportSize.set(nextViewport);
      setViewport((current) =>
        current.height === nextViewport.height &&
        current.width === nextViewport.width
          ? current
          : nextViewport
      );
    },
    [viewportSize]
  );

  const clearActiveStroke = useCallback(() => {
    "worklet";
    activePoints.set([]);
    activePathBuilder.modify((builder) => {
      "worklet";
      builder.reset();
      return builder;
    }, true);
  }, [activePathBuilder, activePoints]);

  const beginActiveStroke = useCallback(
    (point: FeedbackPoint, x: number, y: number) => {
      "worklet";
      activePoints.set([point]);
      activePathBuilder.modify((builder) => {
        "worklet";
        builder.reset();
        builder.moveTo(x, y);
        return builder;
      }, true);
    },
    [activePathBuilder, activePoints]
  );

  const appendActiveStroke = useCallback(
    (point: FeedbackPoint, x: number, y: number) => {
      "worklet";
      const current = activePoints.get();
      if (!shouldAppendFeedbackPoint(current.at(-1), point)) {
        return;
      }
      activePoints.modify((points) => {
        "worklet";
        points.push(point);
        return points;
      }, true);
      activePathBuilder.modify((builder) => {
        "worklet";
        builder.lineTo(x, y);
        return builder;
      }, true);
    },
    [activePathBuilder, activePoints]
  );

  const finishActiveStroke = useCallback(
    (point: FeedbackPoint, x: number, y: number) => {
      "worklet";
      appendActiveStroke(point, x, y);
      const completed = activePoints.get().slice();
      if (completed.length > 1) {
        scheduleOnRN(onStroke, completed);
      }
      clearActiveStroke();
    },
    [activePoints, appendActiveStroke, clearActiveStroke, onStroke]
  );

  const gesture = useMemo(() => {
    const draw = Gesture.Pan()
      .enabled(mode === "draw")
      .maxPointers(1)
      .minDistance(0)
      .onBegin((event) => {
        "worklet";
        beginActiveStroke(
          normalizedPoint(
            {
              pointerType: event.pointerType,
              pressure: event.stylusData?.pressure,
              x: event.x,
              y: event.y,
            },
            viewportSize.get()
          ),
          event.x,
          event.y
        );
      })
      .onUpdate((event) => {
        "worklet";
        appendActiveStroke(
          normalizedPoint(
            {
              pointerType: event.pointerType,
              pressure: event.stylusData?.pressure,
              x: event.x,
              y: event.y,
            },
            viewportSize.get()
          ),
          event.x,
          event.y
        );
      })
      .onEnd((event, success) => {
        "worklet";
        if (!success) {
          clearActiveStroke();
          return;
        }
        finishActiveStroke(
          normalizedPoint(
            {
              pointerType: event.pointerType,
              pressure: event.stylusData?.pressure,
              x: event.x,
              y: event.y,
            },
            viewportSize.get()
          ),
          event.x,
          event.y
        );
      })
      .onFinalize((_event, success) => {
        "worklet";
        if (!success) {
          clearActiveStroke();
        }
      });

    const select = Gesture.Tap()
      .enabled(mode === "select")
      .onEnd((event, success) => {
        "worklet";
        if (!success) {
          return;
        }
        scheduleOnRN(
          onSelect,
          normalizedPoint(
            {
              pointerType: event.pointerType,
              pressure: undefined,
              x: event.x,
              y: event.y,
            },
            viewportSize.get()
          )
        );
      });

    return Gesture.Exclusive(draw, select);
  }, [
    appendActiveStroke,
    beginActiveStroke,
    clearActiveStroke,
    finishActiveStroke,
    mode,
    onSelect,
    viewportSize,
  ]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        onLayout={handleLayout}
        pointerEvents={mode === "browse" ? "none" : "auto"}
        style={[StyleSheet.absoluteFill, styles.overlay]}
        testID="preview-feedback-overlay"
      >
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          {strokes.map((stroke) => (
            <Path
              color="#ef4444"
              key={stroke.id}
              path={pathForPoints(stroke.points, viewport)}
              strokeCap="round"
              strokeJoin="round"
              strokeWidth={3}
              style="stroke"
            />
          ))}
          <Path
            color="#ef4444"
            path={activePath}
            strokeCap="round"
            strokeJoin="round"
            strokeWidth={3}
            style="stroke"
          />
          {selections.map((selection) => (
            <Fragment key={selection.id}>
              {selection.rect ? (
                <>
                  <RoundedRect
                    color="rgba(59, 130, 246, 0.12)"
                    height={selection.rect.height * viewport.height}
                    r={5}
                    width={selection.rect.width * viewport.width}
                    x={selection.rect.x * viewport.width}
                    y={selection.rect.y * viewport.height}
                  />
                  <RoundedRect
                    color="#3b82f6"
                    height={selection.rect.height * viewport.height}
                    r={5}
                    strokeWidth={2}
                    style="stroke"
                    width={selection.rect.width * viewport.width}
                    x={selection.rect.x * viewport.width}
                    y={selection.rect.y * viewport.height}
                  />
                </>
              ) : null}
              <Circle
                color="rgba(59, 130, 246, 0.18)"
                cx={selection.x * viewport.width}
                cy={selection.y * viewport.height}
                r={12}
              />
              <Circle
                color="#3b82f6"
                cx={selection.x * viewport.width}
                cy={selection.y * viewport.height}
                r={12}
                strokeWidth={2}
                style="stroke"
              />
            </Fragment>
          ))}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

export default FeedbackOverlayCanvas;

const styles = StyleSheet.create({
  overlay: {
    elevation: 1,
    zIndex: 1,
  },
});
