import 'package:flowpost_desktop/features/offline/connectivity.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport whose outcome the test picks.
class _Transport implements PostsTransport {
  _Transport({this.error, this.rows = const []});

  final Object? error;
  final List<Map<String, Object?>> rows;

  @override
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
    String? token,
  }) async {
    final error = this.error;
    if (error != null) throw error;
    return rows;
  }
}

void main() {
  late ProviderContainer container;

  setUp(() {
    container = ProviderContainer();
    addTearDown(container.dispose);
  });

  ReportingTransport transport(PostsTransport inner) {
    final connectivity = container.read(connectivityProvider.notifier);
    return ReportingTransport(
      inner: inner,
      onReached: connectivity.reached,
      onLost: connectivity.lost,
    );
  }

  Future<void> send(PostsTransport inner) => transport(inner).send(
    method: 'GET',
    url: Uri.parse('https://test.supabase.co/rest/v1/posts'),
  );

  test('the app starts online, before any call', () {
    expect(container.read(connectivityProvider), ConnectionStatus.online);
  });

  test('a call that reached the server leaves the app online', () async {
    container.read(connectivityProvider.notifier).lost();

    await send(_Transport(rows: const []));

    expect(container.read(connectivityProvider), ConnectionStatus.online);
  });

  test('a connection that never opened puts the app offline', () async {
    await expectLater(
      send(
        _Transport(
          error: const PostsException(
            'No route to host.',
            kind: PostsErrorKind.connection,
          ),
        ),
      ),
      throwsA(isA<PostsException>()),
    );

    expect(container.read(connectivityProvider), ConnectionStatus.offline);
  });

  test('a timeout leaves the app online: the server was reached', () async {
    container.read(connectivityProvider.notifier).lost();

    await expectLater(
      send(
        _Transport(
          error: const PostsException(
            'The queue did not answer. Try again.',
            kind: PostsErrorKind.timeout,
          ),
        ),
      ),
      throwsA(isA<PostsException>()),
    );

    expect(container.read(connectivityProvider), ConnectionStatus.online);
  });

  test('an error answer leaves the app online', () async {
    container.read(connectivityProvider.notifier).lost();

    await expectLater(
      send(
        _Transport(
          error: const PostsException('The queue refused the post (500).'),
        ),
      ),
      throwsA(isA<PostsException>()),
    );

    expect(container.read(connectivityProvider), ConnectionStatus.online);
  });
}
