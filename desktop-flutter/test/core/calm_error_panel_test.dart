import 'package:flowpost_desktop/core/logging/calm_error_panel.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('the panel names the failure and says the rest still works', (
    tester,
  ) async {
    await tester.pumpWidget(const CalmErrorPanel());

    expect(
      find.text('This part of the screen could not be shown.'),
      findsOneWidget,
    );
    expect(find.text('The rest of the app still works.'), findsOneWidget);
  });

  testWidgets('a subtree that throws shows the panel beside its neighbours', (
    tester,
  ) async {
    final original = ErrorWidget.builder;
    ErrorWidget.builder = calmErrorPanel;
    try {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: Column(children: [_Boom(), Text('the rest')]),
        ),
      );

      expect(tester.takeException(), isA<StateError>());
      expect(
        find.text('This part of the screen could not be shown.'),
        findsOneWidget,
      );
      expect(find.text('the rest'), findsOneWidget);
    } finally {
      // The test binding fails the test if the builder is still ours when the
      // body returns, so this cannot wait for addTearDown.
      ErrorWidget.builder = original;
    }
  });
}

class _Boom extends StatelessWidget {
  const _Boom();

  @override
  Widget build(BuildContext context) => throw StateError('build boom');
}
