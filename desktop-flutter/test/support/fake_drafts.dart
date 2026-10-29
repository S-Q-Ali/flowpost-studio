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

  /// False stands for a store that refuses the write.
  bool savesNow = true;

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
  Future<List<ComposeDraft>> all() async {
    final all = drafts.values.toList()
      ..sort((a, b) => b.savedAt.compareTo(a.savedAt));
    return all;
  }

  @override
  Future<ComposeDraft?> load(String videoId) async {
    loads++;
    return drafts[videoId];
  }

  @override
  Future<bool> save(ComposeDraft draft) async {
    saves++;
    if (!savesNow) return false;
    drafts[draft.videoId] = draft;
    return true;
  }

  @override
  Future<void> delete(String videoId) async {
    deleted.add(videoId);
    drafts.remove(videoId);
  }
}
