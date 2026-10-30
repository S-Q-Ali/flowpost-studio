import 'package:flutter/widgets.dart';

const String calmPanelTitle = 'This part of the screen could not be shown.';
const String calmPanelBody = 'The rest of the app still works.';

/// What a release build shows in place of a widget whose build threw.
///
/// The failure itself is already in the log through [installErrorHandlers];
/// this only replaces the red box a release build would otherwise paint.
Widget calmErrorPanel(FlutterErrorDetails details) => const CalmErrorPanel();

/// Deliberately built from primitives: the panel must not need a theme, a
/// Directionality or a Material ancestor that the failure may have taken with
/// it.
class CalmErrorPanel extends StatelessWidget {
  const CalmErrorPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return const Directionality(
      textDirection: TextDirection.ltr,
      child: ColoredBox(
        color: Color(0xFFF3F4F6),
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                calmPanelTitle,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1F2937),
                ),
              ),
              SizedBox(height: 4),
              Text(
                calmPanelBody,
                style: TextStyle(fontSize: 13, color: Color(0xFF4B5563)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
