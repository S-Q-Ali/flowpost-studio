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

  /// Set false to stand for a drafts file the store refused.
  bool availableNow = true;

  int salvageRuns = 0;

  @override
  Future<bool> available() async => availableNow;

  @override
  Future<bool> startFresh() async {
    salvageRuns++;
    availableNow = true;
    drafts.clear();
    return true;
  }

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
