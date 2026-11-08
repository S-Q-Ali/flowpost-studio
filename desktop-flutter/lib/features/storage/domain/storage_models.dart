class StorageQuota {
  const StorageQuota({required this.usedBytes, this.totalBytes});

  final int usedBytes;
  final int? totalBytes;

  double get fraction => (totalBytes != null && totalBytes! > 0)
      ? (usedBytes / totalBytes!).clamp(0.0, 1.0)
      : 0.0;

  static String formatBytes(int bytes) {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
}

class StorageFileItem {
  const StorageFileItem({
    required this.id,
    required this.name,
    required this.isFolder,
    this.sizeBytes = 0,
    this.mimeType,
    this.modifiedTime,
  });

  final String id;
  final String name;
  final bool isFolder;
  final int sizeBytes;
  final String? mimeType;
  final DateTime? modifiedTime;
}
