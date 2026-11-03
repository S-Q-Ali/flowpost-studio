/**
 * The value after `token=` or `access_token=` in a logged message.
 *
 * A get-file proxy URL is `.../get-file?token=<sealed media source>` and
 * platforms answer a rejected URL by echoing that URL back, so an upstream
 * error body logged as it arrives hands out a live link to someone's media.
 * The same goes for the page-account token a Graph API error can repeat.
 */
const TOKEN_IN_TEXT = /(access_)?token=[^\s"'&,;\\]+/g;

export function redactTokens(text: string): string {
  return text.replace(TOKEN_IN_TEXT, "$1token=[redacted]");
}
