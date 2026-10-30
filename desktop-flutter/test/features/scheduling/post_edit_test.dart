import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/domain/post_edit.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_time_zone.dart';

EditCheck _check({
  String caption = 'A caption',
  String date = '2026-10-30',
  String time = '10:00',
  DateTime? previousScheduledAt,
  DateTime? now,
  FakeTimeZone? zone,
  PublishPlatform platform = PublishPlatform.instagram,
}) {
  return checkScheduleEdit(
    platform: platform,
    caption: caption,
    date: date,
    time: time,
    previousScheduledAt: previousScheduledAt,
    now: now ?? DateTime.utc(2026, 10, 29, 12),
    zone: zone ?? fixedZone(),
  );
}

void main() {
  group('the caption', () {
    test('over the platform limit is refused', () {
      final check = _check(caption: 'a' * 2201);

      expect(check.isValid, isFalse);
      expect(
        check.message,
        'The Instagram caption is 2201 characters. The limit is 2200.',
      );
    });

    test('at the limit is accepted', () {
      expect(_check(caption: 'a' * 2200).isValid, isTrue);
    });

    test('with no limit is accepted at any length', () {
      expect(
        _check(platform: PublishPlatform.facebook, caption: 'a' * 5000).isValid,
        isTrue,
      );
    });
  });

  group('the time', () {
    test('an unreadable date is refused', () {
      expect(_check(date: '30/10/2026').message, contains('YYYY-MM-DD'));
    });

    test('a wall clock the zone skips is refused', () {
      final check = _check(
        date: '2026-03-08',
        time: '02:30',
        now: DateTime.utc(2026, 1, 1),
        zone: easternSpringForward(),
      );

      expect(check.isValid, isFalse);
      expect(check.message, contains('does not exist'));
    });

    test('a wall clock that happens twice saves the first one', () {
      final check = _check(
        date: '2026-11-01',
        time: '01:30',
        now: DateTime.utc(2026, 1, 1),
        zone: easternFallBack(),
      );

      expect(check.isValid, isTrue);
      expect(check.instant, DateTime.utc(2026, 11, 1, 5, 30));
    });

    test('an ordinary time resolves to its instant', () {
      final check = _check(date: '2026-10-30', time: '10:00');

      expect(check.instant, DateTime.utc(2026, 10, 30, 9));
    });

    test('a changed time in the past is refused', () {
      final check = _check(
        date: '2026-10-29',
        time: '10:00',
        previousScheduledAt: DateTime.utc(2026, 10, 30, 9),
      );

      expect(check.isValid, isFalse);
      expect(check.message, 'The scheduled time is in the past.');
    });

    test('a past time that is not touched is accepted', () {
      // Editing only the caption of a row that is already waiting.
      final check = _check(
        date: '2026-10-29',
        time: '10:00',
        previousScheduledAt: DateTime.utc(2026, 10, 29, 9),
      );

      expect(check.isValid, isTrue);
      expect(check.instant, DateTime.utc(2026, 10, 29, 9));
    });
  });

  test('an edit writes only the fields the form changes', () {
    final row = PostEdit(
      caption: 'New caption',
      hashtags: '#new',
      containsAlteredContent: true,
      scheduledAt: DateTime.utc(2026, 10, 30, 9),
    ).toRow();

    expect(row, {
      'caption': 'New caption',
      'hashtags': '#new',
      'contains_altered_content': true,
      'scheduled_at': '2026-10-30T09:00:00.000Z',
    });
  });

  group('the confirmation sentence', () {
    ScheduledPost postWith(PostStatus status, {DateTime? publishedAt}) {
      return ScheduledPost(
        id: 'post-1',
        status: status,
        platform: PublishPlatform.instagram,
        scheduledAt: DateTime(2026, 10, 29, 10),
        publishedAt: publishedAt,
      );
    }

    const tail = 'The caption is deleted with it and it cannot be recovered.';

    test('cancels a scheduled row by name and time', () {
      expect(
        deleteSentence(postWith(PostStatus.scheduled)),
        'Delete the Instagram post for 29 October 2026 at 10:00? $tail',
      );
    });

    test('throws away a failed row and says it failed', () {
      expect(
        deleteSentence(postWith(PostStatus.failed)),
        'Delete the failed Instagram post for 29 October 2026 at 10:00? $tail',
      );
    });

    test('deletes a published row without pretending it was stopped', () {
      expect(
        deleteSentence(
          postWith(
            PostStatus.published,
            publishedAt: DateTime(2026, 10, 29, 10),
          ),
        ),
        'Delete the Instagram post that went out on 29 October 2026 at '
        '10:00? $tail',
      );
    });

    test('a row still processing cannot be called stuck', () {
      final post = ScheduledPost(
        id: 'post-1',
        status: PostStatus.processing,
        platform: PublishPlatform.instagram,
        scheduledAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      expect(post.isStaleProcessing(), isFalse);
    });

    test('a row stuck on processing says the post may be out there', () {
      final post = ScheduledPost(
        id: 'post-1',
        status: PostStatus.processing,
        platform: PublishPlatform.instagram,
        scheduledAt: DateTime.now().subtract(const Duration(minutes: 31)),
      );

      expect(post.isStaleProcessing(), isTrue);
      expect(deleteSentence(post), contains('may already be on the platform'));
    });
  });
}
