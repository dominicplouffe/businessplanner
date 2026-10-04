import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/* The same document at the origin's root. MCP clients written to the
   2025-03-26 revision of the spec look here rather than following the
   resource metadata to the issuer's own path. */
export const GET = oauthProviderAuthServerMetadata(auth);
