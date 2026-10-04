import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/* RFC 8414 metadata for the issuer at /api/auth. The issuer has a path, so
   the document lives at the well-known prefix followed by that path — Next
   does not route it to the auth handler on its own. */
export const GET = oauthProviderAuthServerMetadata(auth);
