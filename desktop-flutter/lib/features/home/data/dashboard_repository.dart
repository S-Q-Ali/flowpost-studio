import '../../publishing/data/posts_repository.dart';
import 'dashboard_models.dart';

abstract class DashboardRepository {
  Future<DashboardData> load();
}

class PostsApiDashboardRepository implements DashboardRepository {
  PostsApiDashboardRepository({
    required this.sessionToken,
    required this.transport,
  });

  final String? sessionToken;
  final PostsTransport transport;

  @override
  Future<DashboardData> load() async {
    if (sessionToken == null || sessionToken!.isEmpty) {
      return const DashboardData();
    }
    try {
      final rows = await transport.send(
        body: {'action': 'dashboard-stats'},
        token: sessionToken,
      );
      if (rows.isEmpty) return const DashboardData();
      return DashboardData.fromRow(rows.first);
    } catch (_) {
      return const DashboardData();
    }
  }
}
