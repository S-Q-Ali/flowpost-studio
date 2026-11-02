import '../../../core/router/deep_links.dart';
import 'connected_account.dart';

/// The one address a desktop connect tells the browser to come back to.
///
/// The auth functions accept this string and nothing else that starts with
/// `flowpost:`, so a link that reaches the app can only be this one.
const String desktopConnectReturnTo = 'flowpost://$connectCallbackHost';

/// What the browser reports about a connect.
enum ConnectResult { connected, denied, failed }

/// What one `flowpost://connect-callback` link answers.
class ConnectCallback {
  const ConnectCallback({
    required this.platform,
    required this.nonce,
    required this.result,
  });

  /// The server's own name, e.g. `instagram` or `google_drive`.
  final String platform;

  /// The 32 bytes this app made when it started this connect.
  final String nonce;

  final ConnectResult result;
}

/// Reads a connect callback link, or answers null for anything else.
///
/// The link is the only thing that arrives from a browser the user may have
/// typed into, so nothing short of this exact shape counts: the `flowpost`
/// scheme, the callback host, no path below it, a platform this app can name,
/// and a 32-byte nonce in lower-case hex. A word in `result` the app does not
/// know is a failure, never a success.
ConnectCallback? parseConnectCallback(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'flowpost') return null;
  if (uri.host != connectCallbackHost) return null;
  if (uri.path.isNotEmpty && uri.path != '/') return null;

  final query = uri.queryParameters;
  final platform = query['platform'];
  if (platform == null || socialPlatformOf(platform) == null) return null;
  final nonce = query['nonce'];
  if (nonce == null || !_nonceFormat.hasMatch(nonce)) return null;
  // The outcome is never left to be guessed: a link that does not state one
  // did not come from a connect.
  final result = query['result'];
  if (result == null) return null;

  return ConnectCallback(
    platform: platform,
    nonce: nonce,
    result: _resultOf(result),
  );
}

final RegExp _nonceFormat = RegExp(r'^[0-9a-f]{64}$');

ConnectResult _resultOf(String? value) => switch (value) {
  'connected' => ConnectResult.connected,
  'denied' => ConnectResult.denied,
  _ => ConnectResult.failed,
};
