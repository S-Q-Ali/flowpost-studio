import 'dart:convert';
import 'dart:io';

import '../domain/storage_models.dart';

abstract class StorageClient {
  Future<StorageQuota?> getDriveQuota(String accountId);
  Future<List<StorageFileItem>> listDriveFiles(
    String accountId, {
    String? folderId,
  });
  Future<StorageQuota?> getMegaQuota(String accountId);
  Future<List<StorageFileItem>> listMegaItems(String accountId, {String? path});
}

class HttpStorageClient implements StorageClient {
  HttpStorageClient({
    required this.supabaseUrl,
    required this.anonKey,
    required this.sessionToken,
  });

  final String supabaseUrl;
  final String anonKey;
  final String? sessionToken;

  Future<Map<String, dynamic>?> _call(
    String functionName,
    Map<String, dynamic> body,
  ) async {
    if (sessionToken == null || sessionToken!.isEmpty) return null;
    final client = HttpClient();
    try {
      final uri = Uri.parse('$supabaseUrl/functions/v1/$functionName');
      final req = await client
          .postUrl(uri)
          .timeout(const Duration(seconds: 20));
      req.headers.set('apikey', anonKey);
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(body));
      final res = await req.close().timeout(const Duration(seconds: 20));
      final text = await res.transform(utf8.decoder).join();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) return decoded;
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  @override
  Future<StorageQuota?> getDriveQuota(String accountId) async {
    final data = await _call('google-drive-auth', {
      'action': 'quota',
      'account_id': accountId,
    });
    if (data == null) return null;
    final limit = (data['limit'] as num?)?.toInt();
    final usage = (data['usage'] as num?)?.toInt() ?? 0;
    return StorageQuota(usedBytes: usage, totalBytes: limit);
  }

  @override
  Future<List<StorageFileItem>> listDriveFiles(
    String accountId, {
    String? folderId,
  }) async {
    final body = <String, dynamic>{
      'action': 'list-files',
      'account_id': accountId,
    };
    if (folderId != null) body['folder_id'] = folderId;
    final data = await _call('google-drive-auth', body);
    if (data == null) return const [];
    final filesRaw = data['files'];
    if (filesRaw is! List) return const [];
    final items = <StorageFileItem>[];
    for (final f in filesRaw) {
      if (f is Map<String, dynamic>) {
        final id = f['id'] as String? ?? '';
        final name = f['name'] as String? ?? '';
        final mime = f['mimeType'] as String? ?? '';
        final isFolder = mime == 'application/vnd.google-apps.folder';
        final size = (f['size'] as num?)?.toInt() ?? 0;
        DateTime? mod;
        if (f['modifiedTime'] is String) {
          mod = DateTime.tryParse(f['modifiedTime']);
        }
        items.add(
          StorageFileItem(
            id: id,
            name: name,
            isFolder: isFolder,
            sizeBytes: size,
            mimeType: mime,
            modifiedTime: mod,
          ),
        );
      }
    }
    return items;
  }

  @override
  Future<StorageQuota?> getMegaQuota(String accountId) async {
    final data = await _call('mega-auth', {
      'action': 'quota',
      'account_id': accountId,
    });
    if (data == null) return null;
    final used = (data['spaceUsed'] as num?)?.toInt() ?? 0;
    final total = (data['spaceTotal'] as num?)?.toInt();
    return StorageQuota(usedBytes: used, totalBytes: total);
  }

  @override
  Future<List<StorageFileItem>> listMegaItems(
    String accountId, {
    String? path,
  }) async {
    final body = <String, dynamic>{
      'action': 'list-items',
      'account_id': accountId,
    };
    if (path != null) body['path'] = path;
    final data = await _call('mega-auth', body);
    if (data == null) return const [];
    final items = <StorageFileItem>[];
    final folders = data['folders'];
    if (folders is List) {
      for (final f in folders) {
        if (f is Map<String, dynamic>) {
          items.add(
            StorageFileItem(
              id: f['nodeId'] as String? ?? f['name'] as String? ?? '',
              name: f['name'] as String? ?? '',
              isFolder: true,
            ),
          );
        }
      }
    }
    final files = data['files'];
    if (files is List) {
      for (final f in files) {
        if (f is Map<String, dynamic>) {
          items.add(
            StorageFileItem(
              id: f['nodeId'] as String? ?? f['name'] as String? ?? '',
              name: f['name'] as String? ?? '',
              isFolder: false,
              sizeBytes: (f['size'] as num?)?.toInt() ?? 0,
            ),
          );
        }
      }
    }
    return items;
  }
}
