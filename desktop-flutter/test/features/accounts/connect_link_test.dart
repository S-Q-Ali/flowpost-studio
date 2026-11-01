import 'package:flowpost_desktop/features/accounts/domain/connect_link.dart';
import 'package:flutter_test/flutter_test.dart';

/// 32 bytes, as the desktop generates them and the server echoes them back.
const String _nonce =
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';

String _link({
  String scheme = 'flowpost',
  String host = 'connect-callback',
  String path = '',
  String platform = 'instagram',
  String nonce = _nonce,
  String result = 'connected',
}) {
  final query = [
    if (platform.isNotEmpty) 'platform=$platform',
    if (nonce.isNotEmpty) 'nonce=$nonce',
    if (result.isNotEmpty) 'result=$result',
  ].join('&');
  return '$scheme://$host$path${query.isEmpty ? '' : '?$query'}';
}

void main() {
  test('the address the browser is sent back to is one fixed string', () {
    expect(desktopConnectReturnTo, 'flowpost://connect-callback');
  });

  test('a well-formed link answers a connect', () {
    final callback = parseConnectCallback(_link())!;

    expect(callback.platform, 'instagram');
    expect(callback.nonce, _nonce);
    expect(callback.result, ConnectResult.connected);
  });

  test('a link that is not flowpost:// is not an answer', () {
    expect(parseConnectCallback(_link(scheme: 'https')), isNull);
    expect(
      parseConnectCallback('http://connect-callback?nonce=$_nonce'),
      isNull,
    );
  });

  test('another host is not the connect callback', () {
    expect(parseConnectCallback(_link(host: 'accounts')), isNull);
    expect(parseConnectCallback(_link(host: '')), isNull);
  });

  test('a path below the callback host is refused', () {
    expect(parseConnectCallback(_link(path: '/extra')), isNull);
    expect(parseConnectCallback(_link(path: '/../../accounts')), isNull);
  });

  test('a link missing a part it needs answers nothing', () {
    expect(parseConnectCallback(_link(platform: '')), isNull);
    expect(parseConnectCallback(_link(nonce: '')), isNull);
    expect(parseConnectCallback(_link(result: '')), isNull);
  });

  test('a nonce that is not 32 bytes of lower-case hex is refused', () {
    expect(parseConnectCallback(_link(nonce: _nonce.substring(0, 32))), isNull);
    expect(parseConnectCallback(_link(nonce: '${_nonce}00')), isNull);
    expect(parseConnectCallback(_link(nonce: _nonce.toUpperCase())), isNull);
    expect(parseConnectCallback(_link(nonce: 'z' * _nonce.length)), isNull);
  });

  test('a platform the app cannot name is refused', () {
    expect(parseConnectCallback(_link(platform: 'myspace')), isNull);
    expect(parseConnectCallback(_link(platform: 'Instagram')), isNull);
  });

  test('every platform the server may connect is accepted', () {
    for (final platform in [
      'youtube',
      'instagram',
      'facebook',
      'tiktok',
      'linkedin',
      'google_drive',
      'mega',
    ]) {
      expect(
        parseConnectCallback(_link(platform: platform))?.platform,
        platform,
      );
    }
  });

  test('the three outcomes are read and anything else is a failure', () {
    expect(
      parseConnectCallback(_link(result: 'connected'))?.result,
      ConnectResult.connected,
    );
    expect(
      parseConnectCallback(_link(result: 'denied'))?.result,
      ConnectResult.denied,
    );
    expect(
      parseConnectCallback(_link(result: 'state_expired'))?.result,
      ConnectResult.failed,
    );
    expect(
      parseConnectCallback(_link(result: 'https://evil.example'))?.result,
      ConnectResult.failed,
    );
  });

  test('parts the app does not use are ignored, not refused', () {
    final callback = parseConnectCallback(
      '${_link()}&reason=the_browser_closed#fragment',
    );

    expect(callback?.nonce, _nonce);
    expect(callback?.result, ConnectResult.connected);
  });
}
