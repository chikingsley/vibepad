import FeedbackOverlayCanvas, {
  type FeedbackOverlayProps,
} from "./feedback-overlay-canvas";

export function FeedbackOverlay(props: FeedbackOverlayProps) {
  return <FeedbackOverlayCanvas {...props} />;
}
