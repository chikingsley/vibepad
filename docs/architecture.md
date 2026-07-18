# Architecture

## Runtime split

VibePad has two product runtimes:

1. The universal Expo client renders projects, sessions, chat, files, previews,
   and coordination state.
2. The host service owns harness processes, provider adapters, filesystem
   access, preview lifecycle, and local coordination integrations.

The client communicates with the host through a versioned HTTP/WebSocket
protocol. It never launches local harness or preview processes itself.

## Canonical versus provider-specific behavior

Canonical concepts are earned by working implementations. OpenCode is the
first reference provider. A concept enters the shared protocol only when it is
needed by VibePad as a product concept and can retain its meaning across
providers.

The first shared concepts are host, project, session, turn, timeline item,
model, permission, question, file change, connection state, and capability.
Each event also retains its provider-native payload for lossless rendering and
forward compatibility.

Capabilities answer whether a connected adapter supports an operation and,
when useful, describe constraints or a provider-owned control surface. The UI
must not infer support from provider names.

## First vertical slice

The first slice connects the client to one host and one real OpenCode server,
lists projects and sessions, resumes or creates a session, streams its timeline,
and handles one real interactive request. The common contract grows from that
running path. Codex is the second provider used to challenge and refine it.
