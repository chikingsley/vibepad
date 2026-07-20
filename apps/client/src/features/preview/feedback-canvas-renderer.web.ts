import type { FeedbackViewport } from "./feedback-points";
import type {
  FeedbackPoint,
  FeedbackSelectionPoint,
  FeedbackStroke,
} from "./preview-interaction";

const traceStroke = (
  context: CanvasRenderingContext2D,
  points: readonly FeedbackPoint[],
  viewport: FeedbackViewport
) => {
  const [first] = points;
  if (!first) {
    return;
  }
  context.beginPath();
  context.moveTo(first.x * viewport.width, first.y * viewport.height);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    context.lineTo(point.x * viewport.width, point.y * viewport.height);
  }
  context.stroke();
};

const drawSelection = (
  context: CanvasRenderingContext2D,
  selection: FeedbackSelectionPoint,
  viewport: FeedbackViewport
) => {
  if (selection.rect) {
    const x = selection.rect.x * viewport.width;
    const y = selection.rect.y * viewport.height;
    const width = selection.rect.width * viewport.width;
    const height = selection.rect.height * viewport.height;
    context.fillStyle = "rgba(59, 130, 246, 0.12)";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#3b82f6";
    context.lineWidth = 2;
    context.setLineDash([5, 3]);
    context.strokeRect(x, y, width, height);
    context.setLineDash([]);
  }

  const x = selection.x * viewport.width;
  const y = selection.y * viewport.height;
  context.beginPath();
  context.arc(x, y, 12, 0, Math.PI * 2);
  context.fillStyle = "rgba(59, 130, 246, 0.18)";
  context.fill();
  context.strokeStyle = "#3b82f6";
  context.lineWidth = 2;
  context.stroke();
};

export function renderFeedbackCanvas({
  activePoints,
  canvas,
  selections,
  strokes,
  viewport,
}: {
  readonly activePoints: readonly FeedbackPoint[];
  readonly canvas: HTMLCanvasElement;
  readonly selections: readonly FeedbackSelectionPoint[];
  readonly strokes: readonly FeedbackStroke[];
  readonly viewport: FeedbackViewport;
}) {
  const context = canvas.getContext("2d");
  if (!context || viewport.height <= 0 || viewport.width <= 0) {
    return;
  }
  const pixelRatio = globalThis.devicePixelRatio || 1;
  const pixelWidth = Math.round(viewport.width * pixelRatio);
  const pixelHeight = Math.round(viewport.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.strokeStyle = "#ef4444";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 3;
  for (const stroke of strokes) {
    traceStroke(context, stroke.points, viewport);
  }
  if (activePoints.length > 1) {
    traceStroke(context, activePoints, viewport);
  }
  for (const selection of selections) {
    drawSelection(context, selection, viewport);
  }
}
