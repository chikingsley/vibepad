import QRCode from "qrcode";

import type { HostPairingCode } from "./service-manager";

export const renderPairingOutput = async (pairing: HostPairingCode) => {
  const qrCode = await QRCode.toString(pairing.invitationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    small: true,
    type: "terminal",
  });
  return [
    "",
    "Pair VibePad",
    qrCode,
    `Code: ${pairing.code}`,
    `Expires: ${pairing.expiresAt}`,
    `Invitation: ${pairing.invitationUrl}`,
    "Scan with the iPad Camera or enter the code in VibePad.",
    "",
  ].join("\n");
};
