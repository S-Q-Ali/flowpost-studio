import 'dart:io';

import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// The rows the `account-list` action answers with.
List<Map<String, Object?>> rows([
  Map<String, Object?>? first,
  Map<String, Object?>? second,
]) => [?first, ?second];

const _youtube = <String, Object?>{
  'id': 'row-1',
  'platform': 'youtube',
  'account_id': 'UC-1',
  'account_name': 'FlowPost',
  'display_name': 'FlowPost Studio',
  'is_connected': true,
  'connected_at': '2026-10-01T09:00:00Z',
  'token_expiry': '2027-01-01T09:00:00Z',
};

const _instagram = <String, Object?>{
  'id': 'row-2',
  'platform': 'instagram',
  'account_id': 'ig-1',
  'account_name': 'flowpost.studio',
  'display_name': null,
  'is_connected': true,
  'connected_at': '2026-10-01T09:00:00Z',
  'token_expiry': null,
};

/// A transport that answers the calls the accounts read makes.
class _FakeTransport implements PostsTransport {
  _FakeTransport({this.reply, this.error});

  /// The rows a successful call answers with.
  final List<Map<String, Object?>>? reply;

  /// What the call throws instead of answering.
  final Object? error;

  Map<String, Object?>? body;
  String? token;
  int calls = 0;

  @override
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  }) async {
    calls++;
    this.body = body;
    this.token = token;
    if (error != null) throw error!;
    return reply ?? const [];
  }
}

class _FakeCache implements AccountsCache {
  _FakeCache([this.accounts = const []]);

  /// What the file holds: the copy the last read left behind.
  List<ConnectedAccount> accounts;
  int saves = 0;

  /// Set to make the write fail, the way a full disk does.
  Object? saveError;

  @override
  Future<List<ConnectedAccount>> load() async => accounts;

  @override
  Future<void> save(List<ConnectedAccount> accounts) async {
    if (saveError != null) throw saveError!;
    this.accounts = accounts;
    saves++;
  }
}

void main() {
  late Directory tempDir;
  late File storeFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('flowpost_accounts_test');
    storeFile = File('${tempDir.path}${Platform.pathSeparator}accounts.json');
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('the cache on this PC', () {
    test('an absent file reads as no accounts', () async {
      expect(await FileAccountsCache(file: storeFile).load(), isEmpty);
      expect(await storeFile.exists(), isFalse);
    });

    test('a corrupt file reads as no accounts', () async {
      await storeFile.writeAsString('{not json');

      expect(await FileAccountsCache(file: storeFile).load(), isEmpty);
    });

    test('a row of an unknown platform is dropped', () async {
      await storeFile.writeAsString(
        '[{"platform":"myspace","accountName":"Old","status":"connected"}]',
      );

      expect(await FileAccountsCache(file: storeFile).load(), isEmpty);
    });

    test('a saved list comes back with the account id', () async {
      final cache = FileAccountsCache(file: storeFile);
      final accounts = [
        const ConnectedAccount(
          platform: SocialPlatform.tiktok,
          accountName: 'FlowPost',
          status: AccountStatus.connected,
          accountId: 'tiktok-1',
          serverPlatform: 'tiktok',
        ),
      ];

      await cache.save(accounts);
      final reloaded = await FileAccountsCache(file: storeFile).load();

      expect(reloaded, hasLength(1));
      expect(reloaded.single.accountId, 'tiktok-1');
      expect(reloaded.single.serverPlatform, 'tiktok');
      expect(reloaded.single.status, AccountStatus.connected);
      expect(await File('${storeFile.path}.tmp').exists(), isFalse);
    });

    test('a row written by an older build still reads', () async {
      await storeFile.writeAsString(
        '[{"platform":"mega","accountName":"Backups","status":"expired"}]',
      );

      final reloaded = await FileAccountsCache(file: storeFile).load();

      expect(reloaded.single.platform, SocialPlatform.mega);
      expect(reloaded.single.accountId, isEmpty);
    });
  });

  group('accountsFromRows', () {
    test('a row becomes the account it says it is', () {
      final accounts = accountsFromRows(rows(_youtube, _instagram));

      expect(accounts, hasLength(2));
      expect(accounts.first.platform, SocialPlatform.youtube);
      expect(accounts.first.serverPlatform, 'youtube');
      expect(accounts.first.accountId, 'UC-1');
      // The name the user sees, not the handle the API answers with.
      expect(accounts.first.accountName, 'FlowPost Studio');
      expect(accounts.first.status, AccountStatus.connected);
      expect(accounts.last.platform, SocialPlatform.meta);
      expect(accounts.last.accountName, 'flowpost.studio');
    });

    test('a platform the desktop has no card for is skipped', () {
      final accounts = accountsFromRows(
        rows(_youtube, {
          'platform': 'myspace',
          'account_id': 'x',
          'is_connected': true,
        }),
      );

      expect(accounts.map((account) => account.accountId), ['UC-1']);
    });

    test('a token past its expiry reads as expired', () {
      final accounts = accountsFromRows(
        rows({..._youtube, 'token_expiry': '2020-01-01T09:00:00Z'}),
      );

      expect(accounts.single.status, AccountStatus.expired);
    });

    test('a row that is not connected reads as disconnected', () {
      final accounts = accountsFromRows(
        rows({..._youtube, 'is_connected': false}),
      );

      expect(accounts.single.status, AccountStatus.disconnected);
    });
  });

  group('the server read', () {
    test(
      'the list comes from the account-list action with the session',
      () async {
        final transport = _FakeTransport(reply: rows(_youtube));
        final repository = ServerAccountsRepository(
          sessionToken: 'license-session',
          transport: transport,
          cache: _FakeCache(),
        );

        final read = await repository.read();

        expect(transport.body, {'action': 'account-list'});
        expect(transport.token, 'license-session');
        expect(read.accounts.single.accountId, 'UC-1');
        expect(read.offline, isFalse);
      },
    );

    test('a successful read leaves its copy on this PC', () async {
      final cache = _FakeCache();
      final repository = ServerAccountsRepository(
        sessionToken: 'license-session',
        transport: _FakeTransport(reply: rows(_youtube, _instagram)),
        cache: cache,
      );

      await repository.read();

      expect(cache.saves, 1);
      expect(cache.accounts.map((account) => account.accountId), [
        'UC-1',
        'ig-1',
      ]);
    });

    test('an answer with no rows is an empty list, not an error', () async {
      final repository = ServerAccountsRepository(
        sessionToken: 'license-session',
        transport: _FakeTransport(reply: const []),
        cache: _FakeCache([
          const ConnectedAccount(
            platform: SocialPlatform.youtube,
            accountName: 'Stale',
            status: AccountStatus.connected,
          ),
        ]),
      );

      final read = await repository.read();

      expect(read.accounts, isEmpty);
      expect(read.offline, isFalse);
    });

    test(
      'a connection failure reads the copy and says it is offline',
      () async {
        final repository = ServerAccountsRepository(
          sessionToken: 'license-session',
          transport: _FakeTransport(
            error: const PostsException(
              'No connection.',
              kind: PostsErrorKind.connection,
            ),
          ),
          cache: _FakeCache([
            const ConnectedAccount(
              platform: SocialPlatform.youtube,
              accountName: 'Saved here',
              status: AccountStatus.connected,
            ),
          ]),
        );

        final read = await repository.read();

        expect(read.offline, isTrue);
        expect(read.accounts.single.accountName, 'Saved here');
      },
    );

    test('a timeout reads the copy too', () async {
      final repository = ServerAccountsRepository(
        sessionToken: 'license-session',
        transport: _FakeTransport(
          error: const PostsException(
            'Too slow.',
            kind: PostsErrorKind.timeout,
          ),
        ),
        cache: _FakeCache(),
      );

      expect((await repository.read()).offline, isTrue);
    });

    test(
      'a session the server refuses is an error, not a stale list',
      () async {
        final repository = ServerAccountsRepository(
          sessionToken: 'license-session',
          transport: _FakeTransport(
            error: const PostsException(
              'Activate your license.',
              kind: PostsErrorKind.rejected,
            ),
          ),
          cache: _FakeCache([
            const ConnectedAccount(
              platform: SocialPlatform.youtube,
              accountName: 'Saved here',
              status: AccountStatus.connected,
            ),
          ]),
        );

        expect(repository.read(), throwsA(isA<PostsException>()));
      },
    );

    test('without a session no call is made', () async {
      final transport = _FakeTransport(reply: rows(_youtube));
      final repository = ServerAccountsRepository(
        sessionToken: null,
        transport: transport,
        cache: _FakeCache(),
      );

      final read = await repository.read();

      expect(transport.calls, 0);
      expect(read.offline, isTrue);
      expect(read.accounts, isEmpty);
    });

    test('a copy that cannot be written does not lose the answer', () async {
      final repository = ServerAccountsRepository(
        sessionToken: 'license-session',
        transport: _FakeTransport(reply: rows(_youtube)),
        cache: _FakeCache()..saveError = StateError('disk full'),
      );

      final read = await repository.read();

      expect(read.accounts.single.accountId, 'UC-1');
      expect(read.offline, isFalse);
    });
  });

  group('the file behind the cache', () {
    test('a read of the real file answers what the server gave', () async {
      final cache = FileAccountsCache(file: storeFile);
      await cache.save([
        const ConnectedAccount(
          platform: SocialPlatform.meta,
          accountName: 'flowpost.studio',
          status: AccountStatus.connected,
          accountId: 'ig-1',
          serverPlatform: 'instagram',
        ),
      ]);
      final repository = ServerAccountsRepository(
        sessionToken: 'license-session',
        transport: _FakeTransport(
          error: const PostsException(
            'No connection.',
            kind: PostsErrorKind.connection,
          ),
        ),
        cache: cache,
      );

      final read = await repository.read();

      expect(read.offline, isTrue);
      expect(read.accounts.single.accountId, 'ig-1');
    });
  });
}
