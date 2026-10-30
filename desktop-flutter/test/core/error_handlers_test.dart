import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/logging/calm_error_panel.dart';
import 'package:flowpost_desktop/core/logging/error_handlers.dart';
import 'package:logging/logging.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<LogRecord> records;
  late StreamSubscription<LogRecord> subscription;
  late FlutterExceptionHandler? originalFlutter;
  late ErrorCallback? originalPlatform;
  late ErrorWidgetBuilder originalErrorWidget;

  setUp(() {
    records = [];
    Logger.root.level = Level.ALL;
    subscription = Logger.root.onRecord.listen(records.add);
    originalFlutter = FlutterError.onError;
    originalPlatform = PlatformDispatcher.instance.onError;
    originalErrorWidget = ErrorWidget.builder;
  });
  tearDown(() async {
    FlutterError.onError = originalFlutter;
    PlatformDispatcher.instance.onError = originalPlatform;
    ErrorWidget.builder = originalErrorWidget;
    await subscription.cancel();
  });

  test('framework errors are logged with their error and stack', () {
    installErrorHandlers(Logger('error-test'), presentError: (_) {});

    FlutterError.onError!(
      FlutterErrorDetails(
        exception: StateError('framework boom'),
        stack: StackTrace.current,
      ),
    );

    expect(
      records.any((record) => record.message.contains('framework boom')),
      isTrue,
    );
    expect(records.any((record) => record.error is StateError), isTrue);
    expect(records.any((record) => record.stackTrace != null), isTrue);
  });

  test('unhandled platform errors are logged and marked handled', () {
    installErrorHandlers(Logger('error-test'), presentError: (_) {});

    final handled = PlatformDispatcher.instance.onError!(
      StateError('async boom'),
      StackTrace.current,
    );

    expect(handled, isTrue);
    expect(
      records.any((record) => record.message.contains('async boom')),
      isTrue,
    );
    expect(records.any((record) => record.error is StateError), isTrue);
  });

  test('a release build swaps the red box for the calm panel', () {
    installErrorHandlers(
      Logger('error-test'),
      presentError: (_) {},
      calmPanel: true,
    );

    expect(ErrorWidget.builder, same(calmErrorPanel));
  });

  test('a debug build keeps the framework box', () {
    final before = ErrorWidget.builder;

    installErrorHandlers(
      Logger('error-test'),
      presentError: (_) {},
      calmPanel: false,
    );

    expect(ErrorWidget.builder, same(before));
  });
}
