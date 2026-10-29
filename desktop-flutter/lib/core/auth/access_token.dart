import 'dart:convert';

/// The id of the user the access token belongs to.
///
/// The Supabase Auth token carries it in the `sub` claim. Returns null when
/// the token cannot be read, so a broken token never becomes a row with a
/// made-up owner.
String? userIdFromAccessToken(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    if (payload is! Map) return null;
    final subject = payload['sub'];
    return subject is String && subject.isNotEmpty ? subject : null;
  } on Object {
    return null;
  }
}
