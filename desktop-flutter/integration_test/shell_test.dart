import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/main.dart' as app;
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // A single launch: the shell takes an OS lock, so a second `app.main()`
  // in the same process would hand off to the first and exit.
  testWidgets('launches the shell and opens the upload screen', (tester) async {
    await app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('FlowPost Studio'), findsWidgets);
    expect(find.textContaining('native desktop experience'), findsOneWidget);

    await tester.tap(find.text('Upload'));
    await tester.pumpAndSettle();

    expect(find.text('Choose a video or image'), findsOneWidget);
    expect(find.text('Choose file'), findsOneWidget);
  });
}
