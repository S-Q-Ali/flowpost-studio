import 'package:flowpost_desktop/features/offline/data/drafts_repository.dart';
import 'package:flowpost_desktop/features/offline/drafts/compose_draft.dart';

/// The drafts as memory, so no test writes to the machine's support folder.
class FakeDraftsRepository implements DraftsRepository {
  FakeDraftsRepository([Map<String, ComposeDraft>? initial])
    : drafts = {...?initial};

  final Map<String, ComposeDraft> drafts;

  /// The media whose draft was deleted, in order.
  final List<String> deleted = [];

  int loads = 0;
  int saves = 0;

  @override
  Future<ComposeDraft?> load(String videoId) async {
    loads++;
    return drafts[videoId];
  }

  @override
  Future<void> save(ComposeDraft draft) async {
    saves++;
    drafts[draft.videoId] = draft;
  }

  @override
  Future<void> delete(String videoId) async {
    deleted.add(videoId);
    drafts.remove(videoId);
  }
}
