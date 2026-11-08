import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../offline/offline_providers.dart';
import 'data/workflows_repository.dart';
import 'domain/workflow.dart';

final workflowsRepositoryProvider = Provider<WorkflowsRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  return PostsApiWorkflowsRepository(
    sessionToken: ref.watch(sessionTokenProvider),
    transport: ref.watch(postsTransportProvider),
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  );
});

final workflowsListProvider = FutureProvider<List<WorkflowItem>>((ref) async {
  final repo = ref.watch(workflowsRepositoryProvider);
  return repo.loadWorkflows();
});
