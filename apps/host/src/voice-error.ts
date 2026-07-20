export type VoiceServiceErrorCode =
  | "voice_not_configured"
  | "voice_unauthorized"
  | "voice_upstream_unavailable";

export class VoiceServiceError extends Error {
  readonly code: VoiceServiceErrorCode;
  readonly status: number;

  constructor(code: VoiceServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = "VoiceServiceError";
    this.code = code;
    this.status = status;
  }
}
