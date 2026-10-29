import 'dart:convert';

import 'package:flowpost_desktop/core/auth/access_token.dart';
import 'package:flutter_test/flutter_test.dart';

/// A token shaped like a JWT, carrying [claims] as its payload.
String token(Map<String, Object?> claims) {
  String part(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.signature';
}

void main() {
  test('the claims of a token can be read', () {
    expect(jwtPayload(token({'sub': 'user-1'})), {'sub': 'user-1'});
  });

  test('a token that is not three parts has no claims', () {
    expect(jwtPayload('not-a-token'), isNull);
    expect(jwtPayload('a.b'), isNull);
  });

  test('a payload that is not JSON has no claims', () {
    expect(jwtPayload('a.%%%.c'), isNull);
  });

  test('the user id is the subject', () {
    expect(userIdFromAccessToken(token({'sub': 'user-1'})), 'user-1');
    expect(userIdFromAccessToken(token({'sub': ''})), isNull);
    expect(userIdFromAccessToken(token({'email': 'a@b.test'})), isNull);
  });

  test('the email is the email claim', () {
    expect(
      emailFromAccessToken(token({'email': 'admin@flowpost.test'})),
      'admin@flowpost.test',
    );
    expect(emailFromAccessToken(token({'email': ''})), isNull);
    expect(emailFromAccessToken(token({'sub': 'user-1'})), isNull);
    expect(emailFromAccessToken('not-a-token'), isNull);
  });
}
