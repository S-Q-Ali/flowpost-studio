/**
 * The Meta hosts this product publishes to, and the Graph version it speaks on
 * each of them.
 *
 * One module, because the same API was being called at three versions across
 * three functions. Meta retires a version two years after it ships, and a call
 * to a retired one fails in a way no screen explains.
 */
const FACEBOOK_GRAPH_VERSION = "v25.0";

// Instagram Login issues and renews its token on Instagram's own host, where
// the app is served on a newer Graph than through the Facebook app.
const INSTAGRAM_LOGIN_GRAPH_VERSION = "v27.0";

export const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
export const FACEBOOK_GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
export const INSTAGRAM_LOGIN_GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_LOGIN_GRAPH_VERSION}`;

/**
 * Where a stored Meta token is accepted.
 *
 * Instagram Login says so in `metadata.graph_host` when it saves the row.
 * Everything else — a Page-linked Instagram, a Facebook Page — is served
 * through the Facebook app, which is also what a row written before that field
 * existed falls back to.
 */
export function metaGraphBase(metadata: unknown): string {
  return (metadata as { graph_host?: unknown } | null)?.graph_host === "instagram"
    ? INSTAGRAM_LOGIN_GRAPH_BASE
    : FACEBOOK_GRAPH_BASE;
}
