import 'package:flowpost_desktop/features/accounts/data/connect_gateway.dart';
import 'package:flowpost_desktop/features/accounts/domain/connect_link.dart';

/// Answers the three connect calls with what the test names.
class FakeConnectGateway implements ConnectGateway {
  FakeConnectGateway({
    this.url = 'https://test.supabase.co/functions/v1/youtube-auth?state=x',
  });

  /// The address `connect-url` hands back.
  String url;

  /// What the next connect or disconnect call throws instead of answering.
  Object? failure;

  /// What the next outcome poll throws instead of answering.
  Object? outcomeFailure;

  /// What the outcome polls answer. Null is the server saying nothing yet.
  ConnectResult? outcome;

  final List<({String platform, String nonce})> connects = [];
  final List<({String platform, String nonce})> outcomes = [];
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
  Future<ConnectResult?> connectOutcome({
    required String platform,
    required String nonce,
  }) async {
    final outcomeFailure = this.outcomeFailure;
    if (outcomeFailure != null) throw outcomeFailure;
    outcomes.add((platform: platform, nonce: nonce));
    return outcome;
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
