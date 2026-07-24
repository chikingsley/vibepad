/**
 * The self-contained browser view page served at a leased view-session path.
 *
 * The page renders JPEG screencast frames onto a canvas, reports its viewport
 * so the host can apply true device-metrics reflow, and forwards pointer,
 * touch, wheel, and keyboard input over the same authenticated WebSocket.
 * Frames are ack-paced: the client confirms each rendered frame before the
 * host sends the next one, so a slow link never accumulates a frame backlog.
 * Everything is inline; the page loads no external assets.
 */
export const renderBrowserViewPage = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>VibePad Browser</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0b0f; }
  #surface { display: block; width: 100vw; height: 100vh; touch-action: none; outline: none; }
  #status {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #9ca3af; font: 15px/1.4 -apple-system, system-ui, sans-serif;
    background: #0b0b0f; transition: opacity 160ms ease; pointer-events: none;
  }
  #status.hidden { opacity: 0; }
</style>
</head>
<body>
<canvas id="surface" tabindex="0"></canvas>
<div id="status">Connecting to the browser…</div>
<script>
(() => {
  "use strict";
  const canvas = document.getElementById("surface");
  const context = canvas.getContext("2d");
  const status = document.getElementById("status");
  const socketUrl = (() => {
    const token = location.pathname.split("/")[4];
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + location.host + "/v1/browser/socket/" + token;
  })();
  const socket = new WebSocket(socketUrl);
  let metadata = null;
  let firstFrame = false;

  const send = (message) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const sendViewport = () => {
    send({
      deviceScaleFactor: Math.min(window.devicePixelRatio || 1, 2),
      height: Math.max(1, Math.round(window.innerHeight)),
      type: "viewport",
      width: Math.max(1, Math.round(window.innerWidth)),
    });
  };

  let resizeTimer = 0;
  const scheduleViewport = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sendViewport, 200);
  };

  const drawFrame = (frame) => {
    const image = new Image();
    image.onload = () => {
      metadata = frame.metadata;
      if (canvas.width !== image.width || canvas.height !== image.height) {
        canvas.width = image.width;
        canvas.height = image.height;
      }
      context.drawImage(image, 0, 0);
      if (!firstFrame) {
        firstFrame = true;
        status.classList.add("hidden");
      }
      send({ type: "ack" });
    };
    image.onerror = () => send({ type: "ack" });
    image.src = "data:image/jpeg;base64," + frame.data;
  };

  socket.addEventListener("open", sendViewport);
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") { return; }
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "frame") { drawFrame(message); }
  });
  socket.addEventListener("close", (event) => {
    status.textContent = event.reason || "The browser view ended. Reopen the browser tab to reconnect.";
    status.classList.remove("hidden");
  });
  window.addEventListener("resize", scheduleViewport);

  const pageCoordinates = (event) => {
    const rect = canvas.getBoundingClientRect();
    const width = metadata ? metadata.deviceWidth : rect.width;
    const height = metadata ? metadata.deviceHeight : rect.height;
    return {
      x: Math.round(((event.clientX - rect.left) / Math.max(1, rect.width)) * width),
      y: Math.round(((event.clientY - rect.top) / Math.max(1, rect.height)) * height),
    };
  };

  const modifiers = (event) =>
    (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) |
    (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);

  const mouseButton = (event) => ["left", "middle", "right"][event.button] || "left";
  const sendInput = (input) => send({ input: input, type: "input" });

  const touches = new Map();
  const touchPoints = () => [...touches.entries()].map(([id, point]) => ({
    force: point.force, id: id, x: point.x, y: point.y,
  }));

  const handlePointer = (event, phase) => {
    event.preventDefault();
    canvas.focus();
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      const point = pageCoordinates(event);
      const id = event.pointerId % 32;
      if (phase === "down") {
        touches.set(id, { force: event.pressure || 0.5, x: point.x, y: point.y });
        sendInput({ kind: "touch", modifiers: modifiers(event), touchPoints: touchPoints(), type: "touchStart" });
      } else if (phase === "move") {
        if (!touches.has(id)) { return; }
        touches.set(id, { force: event.pressure || 0.5, x: point.x, y: point.y });
        sendInput({ kind: "touch", modifiers: modifiers(event), touchPoints: touchPoints(), type: "touchMove" });
      } else {
        if (!touches.has(id)) { return; }
        touches.delete(id);
        sendInput({
          kind: "touch",
          modifiers: modifiers(event),
          touchPoints: touchPoints(),
          type: phase === "cancel" ? "touchCancel" : "touchEnd",
        });
      }
      return;
    }
    const point = pageCoordinates(event);
    const type = phase === "down" ? "mousePressed" : phase === "move" ? "mouseMoved" : "mouseReleased";
    sendInput({
      button: phase === "move" && event.buttons === 0 ? "none" : mouseButton(event),
      clickCount: phase === "move" ? 0 : Math.max(1, event.detail || 1),
      kind: "mouse",
      modifiers: modifiers(event),
      type: type,
      x: point.x,
      y: point.y,
    });
  };

  canvas.addEventListener("pointerdown", (event) => handlePointer(event, "down"));
  canvas.addEventListener("pointermove", (event) => handlePointer(event, "move"));
  canvas.addEventListener("pointerup", (event) => handlePointer(event, "up"));
  canvas.addEventListener("pointercancel", (event) => handlePointer(event, "cancel"));
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const point = pageCoordinates(event);
    sendInput({
      deltaX: Math.max(-4096, Math.min(4096, event.deltaX)),
      deltaY: Math.max(-4096, Math.min(4096, event.deltaY)),
      kind: "wheel",
      modifiers: modifiers(event),
      x: point.x,
      y: point.y,
    });
  }, { passive: false });

  const handleKey = (event, type) => {
    event.preventDefault();
    sendInput({
      code: event.code || "",
      key: event.key || "",
      kind: "key",
      modifiers: modifiers(event),
      text: event.key && event.key.length === 1 ? event.key : "",
      type: type,
    });
  };
  window.addEventListener("keydown", (event) => handleKey(event, "keyDown"));
  window.addEventListener("keyup", (event) => handleKey(event, "keyUp"));
})();
</script>
</body>
</html>
`;
