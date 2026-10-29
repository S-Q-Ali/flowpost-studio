import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/drafts_repository.dart';

/// The local drafts. The tests override it with an in-memory repository, so
/// no test writes to the machine's support folder.
final draftsRepositoryProvider = Provider<DraftsRepository>((ref) {
  final repository = LocalDraftsRepository();
  ref.onDispose(repository.close);
  return repository;
});
