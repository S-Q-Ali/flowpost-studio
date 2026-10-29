import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/update/update_banner.dart';

void main() {
  testWidgets('shows the available version and opens the download', (
    tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UpdateBanner(
            latestVersion: '1.1.0',
            onDownload: () => opened = true,
          ),
        ),
      ),
    );

    expect(find.textContaining('1.1.0'), findsOneWidget);
    expect(find.text('Download'), findsOneWidget);

    await tester.tap(find.text('Download'));
    expect(opened, isTrue);
  });
}
