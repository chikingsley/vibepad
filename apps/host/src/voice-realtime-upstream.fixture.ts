import { serve } from "bun";

let receivedAudioBytes = 0;

const server = serve({
  fetch(request, bunServer) {
    if (request.headers.get("authorization") !== "Bearer fixture-key") {
      return new Response("Unauthorized", { status: 401 });
    }
    return bunServer.upgrade(request)
      ? undefined
      : new Response("Upgrade failed", { status: 400 });
  },
  hostname: "127.0.0.1",
  port: 0,
  websocket: {
    message(socket, message) {
      if (typeof message !== "string") {
        receivedAudioBytes += message.byteLength;
        return;
      }
      if (message !== JSON.stringify({ type: "close" })) {
        socket.close(1008, "Unexpected command");
        return;
      }
      socket.send(
        JSON.stringify({
          protocol_version: 1,
          result: {
            content: {
              text:
                receivedAudioBytes > 0
                  ? "Synthetic microphone transcription"
                  : "",
            },
          },
          sequence: 2,
          session_id: "visual-fixture-session",
          status: "succeeded",
          type: "session.completed",
        })
      );
    },
    open(socket) {
      receivedAudioBytes = 0;
      socket.send(
        JSON.stringify({
          language: "en",
          model: "elevenlabs-scribe_v2",
          protocol_version: 1,
          sequence: 1,
          session_id: "visual-fixture-session",
          type: "session.started",
        })
      );
    },
  },
});

console.info(server.url.toString());

const shutdown = () => {
  server.stop(true);
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
