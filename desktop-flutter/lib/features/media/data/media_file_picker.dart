import 'dart:io';

import 'package:file_selector/file_selector.dart';

import '../domain/media_validation.dart';

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
    // The dialog and the validator must agree, so both read the same list.
    const typeGroup = XTypeGroup(
      label: 'FlowPost media',
      extensions: [...videoMediaExtensions, ...imageMediaExtensions],
    );
    final picked = await openFile(acceptedTypeGroups: [typeGroup]);
    final path = picked?.path;
    return path == null ? null : File(path);
  }
}
