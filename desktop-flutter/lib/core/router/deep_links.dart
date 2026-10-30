/// Returns a log-safe form of a deep link: scheme, host and path only.
/// Query strings and fragments routinely carry OAuth codes/tokens.
String describeDeepLink(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'flowpost') return '<malformed>';
  return 'flowpost://${uri.host}${uri.path}';
}

/// Parses `flowpost://` URIs into in-app routes against a fixed allowlist.
/// For custom schemes Dart puts the first segment in `host`, so `host` and
/// `path` are flattened into segments. Anything unknown returns null so the
/// caller can reject and log it.
String? resolveDeepLink(Uri uri, {required List<String> allowedPaths}) {
  if (uri.scheme != 'flowpost') return null;
  final segments = <String>[
    if (uri.host.isNotEmpty) uri.host,
    ...uri.path.split('/').where((s) => s.isNotEmpty),
  ];
  if (segments.isEmpty) {
    return allowedPaths.contains('/') ? '/' : null;
  }
  final first = '/${segments.first}';
  if (!allowedPaths.contains(first)) return null;
  if (segments.length > 1) return null; // deeper paths are not routable
  return uri.hasQuery ? '$first?${uri.query}' : first;
}
