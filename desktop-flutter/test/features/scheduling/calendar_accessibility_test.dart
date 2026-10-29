import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/calendar_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';
import '../../support/fake_scheduled_posts.dart';

final DateTime _today = DateTime(2026, 10, 29);
final Key _chip = const Key('calendar-post-post-1');

Future<void> _pump(WidgetTester tester) async {
  final repository = FakeScheduledPostsRepository()
    ..rangePosts = [
      post(scheduledAt: DateTime(2026, 10, 29, 14, 30), videoTitle: 'A video'),
    ];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
        postsCacheProvider.overrideWithValue(FakePostsCache()),
        todayProvider.overrideWithValue(_today),
      ],
      child: const MaterialApp(home: CalendarPage()),
    ),
  );
  await tester.pumpAndSettle();
}

/// Tabs until the calendar chip owns the focus, or gives up.
Future<bool> _tabToChip(WidgetTester tester) async {
  for (var press = 0; press < 30; press++) {
    final focus = FocusManager.instance.primaryFocus;
    final context = focus?.context;
    if (context != null) {
      var found = false;
      context.visitAncestorElements((element) {
        if (element.widget.key == _chip) {
          found = true;
          return false;
        }
        return true;
      });
      if (found) return true;
    }
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
  }
  return false;
}

void main() {
  testWidgets('a chip says its time, title and status, and is a button', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester);

    try {
      expect(
        find.bySemanticsLabel('14:30, A video, Scheduled'),
        findsOneWidget,
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('a day cell says its date and how many posts it holds', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester);

    try {
      expect(
        find.bySemanticsLabel('Thursday, 29 October 2026, 1 post'),
        findsOneWidget,
      );
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('Tab reaches a chip and Enter opens the post', (tester) async {
    await _pump(tester);

    expect(await _tabToChip(tester), isTrue, reason: 'Tab never reached it');

    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('post-when')), findsOneWidget);
  });

  testWidgets('a focused chip opens with the space bar too', (tester) async {
    await _pump(tester);
    expect(await _tabToChip(tester), isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('post-when')), findsOneWidget);
  });
}
