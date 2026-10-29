import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/main.dart' as app;
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('launches the shell and shows the home screen', (tester) async {
    await app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('FlowPost Studio'), findsWidgets);
    expect(find.textContaining('native desktop experience'), findsOneWidget);
  });
}
