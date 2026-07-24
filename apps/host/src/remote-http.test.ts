import type { HarnessAdapter } from "@vibepad/protocol/provider";
import {
  sshTargetListResponseSchema,
  sshTargetsPath,
} from "@vibepad/protocol/remote";
import { expect, it } from "vitest";

import { createRequestHandler } from "./http";

it("exposes controller SSH targets through the authenticated host API", async () => {
  const handler = createRequestHandler(
    {} as HarnessAdapter,
    "hojo",
    undefined,
    undefined,
    undefined,
    {
      listTargets: () =>
        Promise.resolve([
          {
            alias: "gmk",
            hostName: "gmk.tailnet.example",
            port: 22,
            source: "ssh-config" as const,
            user: "simon",
          },
        ]),
    }
  );

  const response = await handler(
    new Request(`http://vibepad.test${sshTargetsPath}`)
  );

  expect(response.status).toBe(200);
  expect(sshTargetListResponseSchema.parse(await response.json()).data).toEqual(
    [
      {
        alias: "gmk",
        hostName: "gmk.tailnet.example",
        port: 22,
        source: "ssh-config",
        user: "simon",
      },
    ]
  );
});
