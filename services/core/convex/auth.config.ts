import type { AuthConfig } from "convex/server";

// Convex trusts JWTs signed by this issuer whose audience ("aud") is "convex".
// Convex refuses to deploy if CLERK_JWT_ISSUER_DOMAIN is not set on the deployment.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
