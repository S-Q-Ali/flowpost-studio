import 'dart:io';

import 'package:file_selector/file_selector.dart';

/// Opens the native file dialog. Kept behind an interface so the upload
/// screen can be driven without a dialog.
abstract class MediaFilePicker {
  Future<File?> pick();
}

/// Native Windows file dialog restricted to the supported extensions.
class FileSelectorMediaPicker implements MediaFilePicker {
  const FileSelectorMediaPicker();

  @override
  Future<File?> pick() async {
    const typeGroup = XTypeGroup(
      label: 'FlowPost media',
      extensions: [
        '.mp4',
        '.m4v',
        '.mov',
        '.webm',
        '.mkv',
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
      ],
    );
    final picked = await openFile(acceptedTypeGroups: [typeGroup]);
    final path = picked?.path;
    return path == null ? null : File(path);
  }
}
