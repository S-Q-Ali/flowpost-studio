import 'package:flowpost_desktop/features/media/captions/domain/caption_prompt.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the caption key of a platform is one the captions module produces', () {
    for (final platform in PublishPlatform.values) {
      expect(
        platformAllowedCaptionKeys[platform.name],
        contains(captionKeyFor(platform)),
        reason: platform.name,
      );
    }
  });

  test('the YouTube title key is one the captions module produces', () {
    expect(
      platformAllowedCaptionKeys[PublishPlatform.youtube.name],
      contains(youtubeTitleCaptionKey),
    );
  });
}
