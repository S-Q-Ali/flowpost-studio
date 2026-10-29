import 'dart:convert';
import 'dart:io';

class UpdateManifest {
  const UpdateManifest({required this.version, required this.downloadUrl});

  final String version;
  final Uri downloadUrl;
}

class UpdateResult {
  const UpdateResult({
    required this.currentVersion,
    this.latestVersion,
    this.downloadUrl,
    this.error,
  });

  final String currentVersion;
  final String? latestVersion;
  final Uri? downloadUrl;
  final String? error;

  bool get hasUpdate {
    final latest = latestVersion;
    final url = downloadUrl;
    if (latest == null || url == null) return false;
    return isNewerVersion(latest, currentVersion);
  }
}

class AppVersion implements Comparable<AppVersion> {
  const AppVersion(this.major, this.minor, this.patch);

  final int major;
  final int minor;
  final int patch;

  static AppVersion? tryParse(String value) {
    // Accept `1.2.3+4` and `1.2.3-beta.1`; compare the numeric core only.
    final core = value.split('+').first.split('-').first;
    final parts = core.split('.');
    if (parts.isEmpty || parts.length > 3) return null;
    final numbers = <int>[];
    for (final part in parts) {
      final number = int.tryParse(part);
      if (number == null) return null;
      numbers.add(number);
    }
    while (numbers.length < 3) {
      numbers.add(0);
    }
    return AppVersion(numbers[0], numbers[1], numbers[2]);
  }

  @override
  int compareTo(AppVersion other) {
    if (major != other.major) return major.compareTo(other.major);
    if (minor != other.minor) return minor.compareTo(other.minor);
    return patch.compareTo(other.patch);
  }
}

bool isNewerVersion(String latest, String current) {
  final latestVersion = AppVersion.tryParse(latest);
  final currentVersion = AppVersion.tryParse(current);
  if (latestVersion == null || currentVersion == null) return false;
  return latestVersion.compareTo(currentVersion) > 0;
}

UpdateManifest parseManifest(String body) {
  final decoded = jsonDecode(body);
  if (decoded is! Map<String, dynamic>) {
    throw const FormatException('manifest must be an object');
  }
  final version = decoded['version'];
  final download = decoded['downloadUrl'];
  if (version is! String ||
      version.isEmpty ||
      AppVersion.tryParse(version) == null) {
    throw const FormatException('manifest version is invalid');
  }
  if (download is! String) {
    throw const FormatException('manifest downloadUrl is missing');
  }
  final uri = Uri.tryParse(download);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw const FormatException('manifest downloadUrl must be https');
  }
  return UpdateManifest(version: version, downloadUrl: uri);
}

/// Checks a JSON manifest. Network/parse failures are returned as an error so
/// the placeholder screen can stay on screen instead of failing startup.
Future<UpdateResult> checkForUpdate({
  required Uri manifestUrl,
  required String currentVersion,
  Future<String> Function(Uri uri)? fetchManifest,
}) async {
  try {
    final body = await (fetchManifest ?? _fetchManifest)(manifestUrl);
    final manifest = parseManifest(body);
    return UpdateResult(
      currentVersion: currentVersion,
      latestVersion: manifest.version,
      downloadUrl: manifest.downloadUrl,
    );
  } on Object {
    return UpdateResult(
      currentVersion: currentVersion,
      error: 'Update check failed',
    );
  }
}

Future<String> _fetchManifest(Uri uri) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final request = await client.getUrl(uri);
    final response = await request.close().timeout(const Duration(seconds: 8));
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException('HTTP ${response.statusCode}', uri: uri);
    }
    return await response.transform(utf8.decoder).join();
  } finally {
    client.close(force: true);
  }
}
