import { spawn } from "node:child_process";

import createBonjour from "bonjour";

interface HostDiscoveryOptions {
  readonly hostId: string;
  readonly hostName: string;
  readonly platform?: NodeJS.Platform;
  readonly port: number;
  readonly spawnProcess?: typeof spawn;
}

export interface HostDiscovery {
  stop: () => void;
}

const startDarwinDiscovery = (
  options: HostDiscoveryOptions,
  spawnProcess: typeof spawn
): HostDiscovery => {
  const process = spawnProcess(
    "/usr/bin/dns-sd",
    [
      "-R",
      options.hostName,
      "_vibepad._tcp",
      "local.",
      String(options.port),
      `hostid=${options.hostId}`,
      `hostname=${options.hostName}`,
      "version=1",
    ],
    { stdio: "ignore" }
  );
  process.on("error", (error) => {
    console.error("VibePad host discovery failed", error);
  });
  return {
    stop() {
      process.kill("SIGTERM");
    },
  };
};

const startBonjourDiscovery = (
  options: HostDiscoveryOptions
): HostDiscovery => {
  const discovery = createBonjour();
  const service = discovery.publish({
    name: options.hostName,
    port: options.port,
    txt: {
      hostid: options.hostId,
      hostname: options.hostName,
      version: "1",
    },
    type: "vibepad",
  });
  service.on("error", (error) => {
    console.error("VibePad host discovery failed", error);
  });
  return {
    stop() {
      service.stop();
      discovery.destroy();
    },
  };
};

export const startHostDiscovery = (
  options: HostDiscoveryOptions
): HostDiscovery => {
  if ((options.platform ?? process.platform) === "darwin") {
    return startDarwinDiscovery(options, options.spawnProcess ?? spawn);
  }
  return startBonjourDiscovery(options);
};
