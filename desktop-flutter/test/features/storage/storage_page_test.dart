import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/storage/data/storage_client.dart';
import 'package:flowpost_desktop/features/storage/domain/storage_models.dart';
import 'package:flowpost_desktop/features/storage/presentation/storage_page.dart';
import 'package:flowpost_desktop/features/storage/storage_providers.dart';

import '../../support/config_overrides.dart';

class _FakeStorageClient implements StorageClient {
  _FakeStorageClient({this.driveQuota, this.driveFiles = const []});

  final StorageQuota? driveQuota;
  final List<StorageFileItem> driveFiles;

  @override
  Future<StorageQuota?> getDriveQuota(String accountId) async => driveQuota;

  @override
  Future<List<StorageFileItem>> listDriveFiles(
    String accountId, {
    String? folderId,
  }) async => driveFiles;

  @override
  Future<StorageQuota?> getMegaQuota(String accountId) async => null;

  @override
  Future<List<StorageFileItem>> listMegaItems(
    String accountId, {
    String? path,
  }) async => const [];
}

void main() {
  const testConfig = AppConfig(
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    updateManifestUrl: '',
  );

  testWidgets('renders StoragePage with no account state when accounts empty', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(testConfig),
          driveAccountsProvider.overrideWithValue([]),
          megaAccountsProvider.overrideWithValue([]),
        ],
        child: const MaterialApp(home: StoragePage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Storage Manager'), findsOneWidget);
    expect(find.text('No Google Drive account connected'), findsOneWidget);
  });

  testWidgets(
    'renders StoragePage with files and quota when accounts present',
    (tester) async {
      final fakeClient = _FakeStorageClient(
        driveQuota: const StorageQuota(
          usedBytes: 1024 * 1024 * 50,
          totalBytes: 1024 * 1024 * 100,
        ),
        driveFiles: const [
          StorageFileItem(id: 'f-1', name: 'RawFootage', isFolder: true),
          StorageFileItem(
            id: 'f-2',
            name: 'clip_01.mp4',
            isFolder: false,
            sizeBytes: 1024 * 1024 * 12,
          ),
        ],
      );

      const mockAccount = ConnectedAccount(
        platform: SocialPlatform.googleDrive,
        serverPlatform: 'google_drive',
        accountName: 'My Drive Account',
        accountId: 'drive-123',
        status: AccountStatus.connected,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            seededConfig(testConfig),
            driveAccountsProvider.overrideWithValue([mockAccount]),
            megaAccountsProvider.overrideWithValue([]),
            storageClientProvider.overrideWithValue(fakeClient),
          ],
          child: const MaterialApp(home: StoragePage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Storage Manager'), findsOneWidget);
      expect(find.text('Storage Usage'), findsOneWidget);
      expect(find.text('50.0 MB / 100.0 MB'), findsOneWidget);
      expect(find.text('RawFootage'), findsOneWidget);
      expect(find.text('clip_01.mp4'), findsOneWidget);
      expect(find.text('12.0 MB'), findsOneWidget);
    },
  );
}
