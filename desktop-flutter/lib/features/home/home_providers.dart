import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../offline/offline_providers.dart';
import 'data/dashboard_models.dart';
import 'data/dashboard_repository.dart';

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  return PostsApiDashboardRepository(
    sessionToken: ref.watch(sessionTokenProvider),
    transport: ref.watch(postsTransportProvider),
  );
});

final dashboardDataProvider = FutureProvider<DashboardData>((ref) async {
  final repo = ref.watch(dashboardRepositoryProvider);
  return repo.load();
});
