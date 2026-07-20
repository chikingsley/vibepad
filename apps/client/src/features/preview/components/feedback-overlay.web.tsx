import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { renderFeedbackCanvas } from "@/features/preview/feedback-canvas-renderer.web";
import {
  type FeedbackViewport,
  normalizeFeedbackPoint,
  shouldAppendFeedbackPoint,
} from "@/features/preview/feedback-points";
import type { FeedbackPoint } from "@/features/preview/preview-interaction";
import type { FeedbackOverlayProps } from "./feedback-overlay-canvas";

const pointerName = (pointerType: string): FeedbackPoint["pointer"] => {
  if (pointerType === "pen") {
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

export function FeedbackOverlay({
  mode,
  onSelect,
  onStroke,
  selections,
  strokes,
}: FeedbackOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<FeedbackViewport>({ height: 0, width: 0 });
  const activePointsRef = useRef<FeedbackPoint[]>([]);
  const activePointerIdRef = useRef<number | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    renderFeedbackCanvas({
      activePoints: activePointsRef.current,
      canvas,
      selections,
      strokes,
      viewport: viewportRef.current,
    });
  }, [selections, strokes]);

  const scheduleDraw = useCallback(() => {
    if (animationFrameRef.current !== undefined) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    const syncViewport = () => {
      const bounds = overlay.getBoundingClientRect();
      viewportRef.current = { height: bounds.height, width: bounds.width };
      draw();
    };
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(overlay);
    syncViewport();
    return () => {
      resizeObserver.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    []
  );

  const pointFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
      normalizeFeedbackPoint(
        {
          pointer: pointerName(event.pointerType),
          pressure: event.pressure,
          x: event.nativeEvent.offsetX,
          y: event.nativeEvent.offsetY,
        },
        viewportRef.current
      ),
    []
  );

  const clearActiveStroke = useCallback(() => {
    activePointerIdRef.current = undefined;
    activePointsRef.current = [];
    scheduleDraw();
  }, [scheduleDraw]);

  const appendPoint = useCallback(
    (point: FeedbackPoint) => {
      const { current } = activePointsRef;
      if (!shouldAppendFeedbackPoint(current.at(-1), point)) {
        return;
      }
      current.push(point);
      scheduleDraw();
    },
    [scheduleDraw]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        mode === "browse" ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      event.preventDefault();
      const point = pointFromEvent(event);
      if (mode === "select") {
        onSelect(point);
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointerIdRef.current = event.pointerId;
      activePointsRef.current = [point];
      scheduleDraw();
    },
    [mode, onSelect, pointFromEvent, scheduleDraw]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== "draw" || activePointerIdRef.current !== event.pointerId) {
        return;
      }
      event.preventDefault();
      appendPoint(pointFromEvent(event));
    },
    [appendPoint, mode, pointFromEvent]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== "draw" || activePointerIdRef.current !== event.pointerId) {
        return;
      }
      event.preventDefault();
      appendPoint(pointFromEvent(event));
      const completed = activePointsRef.current;
      if (completed.length > 1) {
        onStroke(completed);
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      clearActiveStroke();
    },
    [appendPoint, clearActiveStroke, mode, onStroke, pointFromEvent]
  );

  return (
    <div
      data-testid="preview-feedback-overlay"
      onPointerCancel={clearActiveStroke}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={overlayRef}
      style={{
        inset: 0,
        pointerEvents: mode === "browse" ? "none" : "auto",
        position: "absolute",
        touchAction: mode === "browse" ? "auto" : "none",
        zIndex: 1,
      }}
    >
      <canvas
        aria-hidden
        ref={canvasRef}
        style={{ height: "100%", pointerEvents: "none", width: "100%" }}
      />
    </div>
  );
}
