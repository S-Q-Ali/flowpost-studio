import 'package:flowpost_desktop/features/accounts/data/connect_gateway.dart';

/// Answers the two connect calls with what the test names.
class FakeConnectGateway implements ConnectGateway {
  FakeConnectGateway({
    this.url = 'https://test.supabase.co/functions/v1/youtube-auth?state=x',
  });

  /// The address `connect-url` hands back.
  String url;

  /// What the next call throws instead of answering.
  Object? failure;

  final List<({String platform, String nonce})> connects = [];
  final List<({String platform, String accountId})> disconnects = [];

  @override
  Future<String> connectUrl({
    required String platform,
    required String nonce,
  }) async {
    final failure = this.failure;
    if (failure != null) throw failure;
    connects.add((platform: platform, nonce: nonce));
    return url;
  }

  @override
  Future<void> disconnect({
    required String platform,
    required String accountId,
  }) async {
    final failure = this.failure;
    if (failure != null) throw failure;
    disconnects.add((platform: platform, accountId: accountId));
  }
}

/// Records the addresses the app tried to open in the browser.
class FakeBrowser {
  final List<Uri> opened = [];

  /// What a launch answers; false means the OS refused the address.
  bool opens = true;

  Future<bool> call(Uri url) async {
    opened.add(url);
    return opens;
  }
}
