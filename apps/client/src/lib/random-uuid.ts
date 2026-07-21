import { getRandomBytes } from "expo-crypto";

const uuidByteCount = 16;

export const uuidFromRandomBytes = (input: Uint8Array) => {
  if (input.length !== uuidByteCount) {
    throw new Error(`UUID input must contain ${uuidByteCount} bytes`);
  }

  const bytes = Uint8Array.from(input);
  bytes[6] = ((bytes[6] ?? 0) % 16) + 64;
  bytes[8] = ((bytes[8] ?? 0) % 64) + 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const randomUuid = () =>
  uuidFromRandomBytes(getRandomBytes(uuidByteCount));
