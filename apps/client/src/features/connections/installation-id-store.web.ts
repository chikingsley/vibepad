import { randomUuid } from "@/lib/random-uuid";

const installationIdKey = "vibepad.installation-id.v1";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

let pageInstallationId: string | undefined;

export const getInstallationId = () => {
  if (pageInstallationId) {
    return pageInstallationId;
  }
  const stored = globalThis.localStorage?.getItem(installationIdKey);
  if (stored && uuid.test(stored)) {
    pageInstallationId = stored;
    return stored;
  }
  pageInstallationId = randomUuid();
  globalThis.localStorage?.setItem(installationIdKey, pageInstallationId);
  return pageInstallationId;
};
