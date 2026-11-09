import 'dart:convert';
import 'dart:io';

import '../../publishing/data/posts_repository.dart';
import '../domain/workflow.dart';

abstract class WorkflowsRepository {
  Future<List<WorkflowItem>> loadWorkflows();
  Future<bool> toggleWorkflow(String id, bool isActive);
  Future<bool> triggerWorkflow(String id);
  Future<WorkflowItem?> createWorkflow(Map<String, dynamic> payload);
  Future<bool> deleteWorkflow(String id);
}

class PostsApiWorkflowsRepository implements WorkflowsRepository {
  PostsApiWorkflowsRepository({
    required this.sessionToken,
    required this.transport,
    required this.supabaseUrl,
    required this.anonKey,
  });

  final String? sessionToken;
  final PostsTransport transport;
  final String supabaseUrl;
  final String anonKey;

  @override
  Future<WorkflowItem?> createWorkflow(Map<String, dynamic> payload) async {
    if (sessionToken == null || sessionToken!.isEmpty) return null;
    try {
      final rows = await transport.send(
        body: {'action': 'workflow-create', ...payload},
        token: sessionToken,
      );
      if (rows.isEmpty) return null;
      return WorkflowItem.fromJson(rows.first);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<bool> deleteWorkflow(String id) async {
    if (sessionToken == null || sessionToken!.isEmpty) return false;
    try {
      final rows = await transport.send(
        body: {'action': 'workflow-delete', 'id': id},
        token: sessionToken,
      );
      return rows.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<WorkflowItem>> loadWorkflows() async {
    if (sessionToken == null || sessionToken!.isEmpty) {
      return const [];
    }
    try {
      final rows = await transport.send(
        body: {'action': 'workflows-list'},
        token: sessionToken,
      );
      final list = <WorkflowItem>[];
      for (final row in rows) {
        final item = WorkflowItem.fromJson(row);
        if (item != null) list.add(item);
      }
      return list;
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<bool> toggleWorkflow(String id, bool isActive) async {
    if (sessionToken == null || sessionToken!.isEmpty) return false;
    try {
      final rows = await transport.send(
        body: {'action': 'workflow-toggle', 'id': id, 'is_active': isActive},
        token: sessionToken,
      );
      return rows.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> triggerWorkflow(String id) async {
    if (sessionToken == null || sessionToken!.isEmpty) return false;
    final client = HttpClient();
    try {
      final uri = Uri.parse('$supabaseUrl/functions/v1/process-workflow');
      final req = await client
          .postUrl(uri)
          .timeout(const Duration(seconds: 30));
      req.headers.set('apikey', anonKey);
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'workflowId': id}));
      final res = await req.close().timeout(const Duration(seconds: 30));
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }
}
