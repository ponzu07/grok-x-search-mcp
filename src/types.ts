export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  idToken?: string;
  tokenType: string;
}

export interface PendingAuth {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  createdAt: number;
}

export type ToolErrorCode =
  | "NO_AUTH"
  | "EXPIRED"
  | "FORBIDDEN_403"
  | "HTTP_ERROR"
  | "STATE_MISMATCH"
  | "LOGIN_EXPIRED"
  | "BAD_REQUEST";

export class ToolError extends Error {
  constructor(
    public code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}
