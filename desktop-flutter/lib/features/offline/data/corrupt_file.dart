import 'dart:io';

import 'package:path/path.dart' as p;

/// Moves a file the app cannot use beside it, stamped with when it was found,
/// so two broken files in the same minute both survive.
///
/// Returns where the file went, or null when it could not be moved. The file
/// is never deleted — the admin removes it, from Explorer.
File? setAsideCorruptFile(File file, DateTime at) {
  final stem =
      '${p.basenameWithoutExtension(file.path)}.corrupt-'
      '${at.year}${_two(at.month)}${_two(at.day)}-'
      '${_two(at.hour)}${_two(at.minute)}';
  final extension = p.extension(file.path);
  var target = File(p.join(file.parent.path, '$stem$extension'));
  for (var n = 2; target.existsSync(); n++) {
    target = File(p.join(file.parent.path, '$stem-$n$extension'));
  }
  try {
    file.renameSync(target.path);
  } on FileSystemException {
    return null;
  }
  return target;
}

String _two(int value) => value.toString().padLeft(2, '0');
