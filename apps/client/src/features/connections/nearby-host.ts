export interface NearbyHost {
  readonly endpoints: readonly string[];
  readonly id: string;
  readonly name: string;
}

export interface DiscoveredService {
  readonly addresses: readonly string[];
  readonly hostName: string;
  readonly name: string;
  readonly port: number;
  readonly txt: Readonly<Record<string, string>>;
}

export const nearbyHostFromService = (
  service: DiscoveredService
): NearbyHost | undefined => {
  const { hostid, hostname, version } = service.txt;
  const id = hostid?.trim();
  if (!(id && version === "1")) {
    return;
  }
  const discoveredHostName = service.hostName.includes(".")
    ? service.hostName
    : `${service.hostName}.local`;
  const endpoints = [
    ...new Set([
      `http://${discoveredHostName}:${service.port}`,
      ...service.addresses
        .filter((address) => !address.includes(":"))
        .map((address) => `http://${address}:${service.port}`),
    ]),
  ];
  return {
    endpoints,
    id,
    name: hostname?.trim() || service.name,
  };
};
