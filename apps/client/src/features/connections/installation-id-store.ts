import { getItemAsync, setItemAsync } from "expo-secure-store";

import { randomUuid } from "@/lib/random-uuid";

const installationIdKey = "vibepad.installation-id.v1";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

let pendingInstallationId: Promise<string> | undefined;

const loadInstallationId = async () => {
  const stored = await getItemAsync(installationIdKey);
  if (stored && uuid.test(stored)) {
    return stored;
  }
  const created = randomUuid();
  await setItemAsync(installationIdKey, created);
  return created;
};

export const getInstallationId = () => {
  pendingInstallationId ??= loadInstallationId();
  return pendingInstallationId;
};
