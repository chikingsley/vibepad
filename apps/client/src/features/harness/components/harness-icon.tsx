import type { HarnessId } from "@vibepad/protocol/provider";
import type { ComponentProps } from "react";

import { ProviderIcon, type ProviderIconName } from "@/components/ui/icon";

const glyphForHarness = {
  "claude-code": "anthropic",
  codex: "openai",
  opencode: "opencode",
} as const satisfies Record<HarnessId, ProviderIconName>;

const labelForHarness = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
} as const satisfies Record<HarnessId, string>;

export const harnessLabel = (harnessId: HarnessId) =>
  labelForHarness[harnessId];

export function HarnessIcon({
  harnessId,
  ...props
}: Omit<ComponentProps<typeof ProviderIcon>, "name"> & {
  readonly harnessId: HarnessId;
}) {
  return <ProviderIcon name={glyphForHarness[harnessId]} {...props} />;
}
