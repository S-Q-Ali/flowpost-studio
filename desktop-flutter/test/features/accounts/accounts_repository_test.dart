import 'dart:io';

import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flutter_test/flutter_test.dart';

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

  test('seeds six accounts when the store does not exist', () async {
    final repository = LocalAccountsRepository(file: storeFile);

    final accounts = await repository.load();

    expect(accounts, hasLength(6));
    expect(accounts.map((a) => a.platform), containsAll(SocialPlatform.values));
    expect(await storeFile.exists(), isTrue);
  });

  test('persists a status change and reloads it', () async {
    final repository = LocalAccountsRepository(file: storeFile);
    final accounts = await repository.load();
    final updated = [
      for (final account in accounts)
        if (account.platform == SocialPlatform.youtube)
          account.copyWith(status: AccountStatus.disconnected)
        else
          account,
    ];

    await repository.save(updated);
    final reloaded = await LocalAccountsRepository(file: storeFile).load();

    expect(
      reloaded.firstWhere((a) => a.platform == SocialPlatform.youtube).status,
      AccountStatus.disconnected,
    );
  });

  test('ignores unknown platforms and reseeds an empty result', () async {
    await storeFile.writeAsString(
      '[{"platform":"myspace","accountName":"Old","status":"connected"}]',
    );

    final accounts = await LocalAccountsRepository(file: storeFile).load();

    expect(accounts, hasLength(6));
  });

  test('reseeds when the file is corrupt', () async {
    await storeFile.writeAsString('{not json');

    final accounts = await LocalAccountsRepository(file: storeFile).load();

    expect(accounts, hasLength(6));
  });

  test('merges a partial file back to six accounts in seed order', () async {
    await storeFile.writeAsString(
      '[{"platform":"tiktok","accountName":"FlowPost Studio","status":"connected"}]',
    );

    final accounts = await LocalAccountsRepository(file: storeFile).load();

    expect(accounts.map((a) => a.platform), [
      for (final seed in seedAccounts) seed.platform,
    ]);
    expect(
      accounts.firstWhere((a) => a.platform == SocialPlatform.tiktok).status,
      AccountStatus.connected,
    );
    expect(
      accounts.firstWhere((a) => a.platform == SocialPlatform.youtube).status,
      AccountStatus.disconnected,
    );
  });

  test('saving over an existing file replaces it', () async {
    final repository = LocalAccountsRepository(file: storeFile);
    await repository.load();

    await repository.save(seedAccounts);

    expect(await storeFile.exists(), isTrue);
    expect(await File('${storeFile.path}.tmp').exists(), isFalse);
  });
}
