import 'dart:convert';

/// The claims a token carries.
///
/// Returns null when the token cannot be read, so a broken token never
/// becomes a row with a made-up owner.
Map<String, dynamic>? jwtPayload(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    return payload is Map<String, dynamic> ? payload : null;
  } on Object {
    return null;
  }
}

/// The id of the user the access token belongs to.
///
/// The Supabase Auth token carries it in the `sub` claim. Returns null when
/// the token cannot be read, so a broken token never becomes a row with a
/// made-up owner.
String? userIdFromAccessToken(String token) {
  final subject = jwtPayload(token)?['sub'];
  return subject is String && subject.isNotEmpty ? subject : null;
}
