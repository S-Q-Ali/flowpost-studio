import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../drafts/compose_draft.dart';
import '../drafts/draft_store.dart';

/// The compose drafts the admin has not published yet.
abstract class DraftsRepository {
  Future<ComposeDraft?> load(String videoId);
  Future<void> save(ComposeDraft draft);
  Future<void> delete(String videoId);
}

/// The drafts in `drafts.db`, in the app's support folder.
///
/// Every method swallows a failure: a store that cannot be read must never
/// take the compose screen down with it. The rest of the app learns about it
/// from the missing draft, and the file stays on disk for the diagnostics
/// screen.
class LocalDraftsRepository implements DraftsRepository {
  LocalDraftsRepository({Future<File> Function()? file, Logger? log})
    : _file = file ?? _supportFile,
      _log = log ?? Logger('drafts');

  final Future<File> Function() _file;
  final Logger _log;
  Future<DraftStore?>? _store;

  Future<DraftStore?> _open() => _store ??= _openStore();

  /// Lets go of the file, so the app can shut down without holding it.
  Future<void> close() async {
    final store = _store;
    if (store == null) return;
    (await store)?.close();
  }

  Future<DraftStore?> _openStore() async {
    try {
      final store = DraftStore(file: await _file());
      return store.open() ? store : null;
    } on Object catch (error) {
      // The type only: a path or a caption must never reach the log.
      _log.warning(
        'The saved drafts could not be opened (${error.runtimeType}).',
      );
      return null;
    }
  }

  @override
  Future<ComposeDraft?> load(String videoId) async {
    try {
      return (await _open())?.load(videoId);
    } on Object catch (error) {
      _log.warning('A draft could not be read (${error.runtimeType}).');
      return null;
    }
  }

  @override
  Future<void> save(ComposeDraft draft) async {
    try {
      (await _open())?.save(draft);
    } on Object catch (error) {
      _log.warning('A draft could not be saved (${error.runtimeType}).');
    }
  }

  @override
  Future<void> delete(String videoId) async {
    try {
      (await _open())?.delete(videoId);
    } on Object catch (error) {
      _log.warning('A draft could not be deleted (${error.runtimeType}).');
    }
  }
}

Future<File> _supportFile() async {
  final dir = await getApplicationSupportDirectory();
  return File(p.join(dir.path, 'drafts.db'));
}
