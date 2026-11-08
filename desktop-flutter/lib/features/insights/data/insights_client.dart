import 'dart:convert';
import 'dart:io';

import '../domain/insights_models.dart';

abstract class InsightsClient {
  Future<InsightsData?> fetchInsights({
    required String platform,
    required String accountId,
    int rangeDays = 30,
  });
}

class HttpInsightsClient implements InsightsClient {
  HttpInsightsClient({
    required this.supabaseUrl,
    required this.anonKey,
    required this.sessionToken,
  });

  final String supabaseUrl;
  final String anonKey;
  final String? sessionToken;

  @override
  Future<InsightsData?> fetchInsights({
    required String platform,
    required String accountId,
    int rangeDays = 30,
  }) async {
    if (sessionToken == null || sessionToken!.isEmpty) return null;
    final functionName = platform == 'facebook'
        ? 'fetch-facebook-insights'
        : 'fetch-instagram-insights';

    final client = HttpClient();
    try {
      final uri = Uri.parse(
        '$supabaseUrl/functions/v1/$functionName?account_id=$accountId&range=$rangeDays',
      );
      final req = await client.getUrl(uri).timeout(const Duration(seconds: 25));
      req.headers.set('apikey', anonKey);
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
      final res = await req.close().timeout(const Duration(seconds: 25));
      final text = await res.transform(utf8.decoder).join();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) {
          return InsightsData.fromJson(platform, decoded);
        }
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }
}
