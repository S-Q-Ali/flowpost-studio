import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_validation.dart';
import 'package:flutter_test/flutter_test.dart';

const _youtube = PublishTarget(
  platform: PublishPlatform.youtube,
  accountId: 'yt-1',
  accountName: 'FlowPost',
);

const _instagram = PublishTarget(
  platform: PublishPlatform.instagram,
  accountId: 'ig-1',
  accountName: 'FlowPost',
);

const _facebookStory = PublishTarget(
  platform: PublishPlatform.facebook,
  accountId: 'fb-1',
  accountName: 'FlowPost',
  postType: PostType.story,
);

PublishValidation _validate({
  List<PublishTarget> targets = const [_instagram],
  Map<String, String> captions = const {},
  MediaKind? mediaKind = MediaKind.video,
  String youtubeTitle = '',
  bool schedule = false,
  String scheduleDate = '',
  String scheduleTime = '',
  DateTime? now,
}) {
  return validatePublish(
    targets: targets,
    captions: captions,
    mediaKind: mediaKind,
    youtubeTitle: youtubeTitle,
    schedule: schedule,
    scheduleDate: scheduleDate,
    scheduleTime: scheduleTime,
    now: now,
  );
}

void main() {
  test('nothing picked is not ready', () {
    final validation = _validate(targets: const []);

    expect(validation.isValid, isFalse);
    expect(validation.issues.single.reason, PublishRejection.noTarget);
  });

  test('a caption under the limit is ready', () {
    final validation = _validate(captions: {_instagram.id: 'A caption'});

    expect(validation.isValid, isTrue);
  });

  test('a caption over the limit is refused and the limit is named', () {
    final validation = _validate(captions: {_instagram.id: 'x' * 2201});

    final issue = validation.issues.single;
    expect(issue.reason, PublishRejection.captionTooLong);
    expect(issue.targetId, _instagram.id);
    expect(issue.message, contains('2201'));
    expect(issue.message, contains('2200'));
  });

  test('a caption exactly at the limit is ready', () {
    final validation = _validate(captions: {_instagram.id: 'x' * 2200});

    expect(validation.isValid, isTrue);
  });

  test('a platform without a limit takes any caption', () {
    const linkedin = PublishTarget(
      platform: PublishPlatform.linkedin,
      accountId: 'li-1',
      accountName: 'FlowPost',
    );
    final validation = _validate(
      targets: const [linkedin],
      captions: {linkedin.id: 'x' * 5000},
    );

    expect(validation.isValid, isTrue);
  });

  test('an image is refused by a video-only platform', () {
    final validation = _validate(
      targets: const [_youtube],
      captions: {_youtube.id: 'A caption'},
      youtubeTitle: 'A title',
      mediaKind: MediaKind.image,
    );

    final issue = validation.issues.single;
    expect(issue.reason, PublishRejection.mediaNotSupported);
    expect(issue.message, 'YouTube does not support image posts.');
  });

  test('an image is refused by a video-only story', () {
    final validation = _validate(
      targets: const [_facebookStory],
      mediaKind: MediaKind.image,
    );

    expect(validation.issues.single.reason, PublishRejection.mediaNotSupported);
  });

  test('a story carries no caption and no limit', () {
    const instagramStory = PublishTarget(
      platform: PublishPlatform.instagram,
      accountId: 'ig-1',
      accountName: 'FlowPost',
      postType: PostType.story,
    );
    final validation = _validate(targets: const [instagramStory]);

    expect(validation.isValid, isTrue);
  });

  test('a YouTube post without a title is not ready', () {
    final validation = _validate(
      targets: const [_youtube],
      captions: {_youtube.id: 'A caption'},
    );

    expect(validation.issues.single.reason, PublishRejection.titleMissing);
  });

  test('a YouTube post with a title is ready', () {
    final validation = _validate(
      targets: const [_youtube],
      captions: {_youtube.id: 'A caption'},
      youtubeTitle: 'A title',
    );

    expect(validation.isValid, isTrue);
  });

  test('a schedule without a date is not ready', () {
    final validation = _validate(schedule: true, scheduleTime: '10:00');

    expect(
      validation.issues.single.reason,
      PublishRejection.scheduleIncomplete,
    );
  });

  test('a malformed date is not ready', () {
    final validation = _validate(
      schedule: true,
      scheduleDate: '29.10.2026',
      scheduleTime: '10:00',
    );

    expect(validation.issues.single.reason, PublishRejection.scheduleInvalid);
    expect(validation.issues.single.message, scheduleFormatMessage);
  });

  test('a day that does not exist is not ready', () {
    final validation = _validate(
      schedule: true,
      scheduleDate: '2026-02-31',
      scheduleTime: '10:00',
    );

    expect(validation.issues.single.reason, PublishRejection.scheduleInvalid);
  });

  test('a time in the past is not ready', () {
    final validation = _validate(
      schedule: true,
      scheduleDate: '2026-10-29',
      scheduleTime: '10:00',
      now: DateTime(2026, 10, 29, 12),
    );

    expect(validation.issues.single.reason, PublishRejection.scheduleInPast);
  });

  test('a time in the future is ready', () {
    final validation = _validate(
      schedule: true,
      scheduleDate: '2026-10-29',
      scheduleTime: '14:00',
      now: DateTime(2026, 10, 29, 12),
    );

    expect(validation.isValid, isTrue);
  });

  test('the date and the time are read in the local timezone', () {
    final local = parseLocalSchedule(date: '2026-10-29', time: '14:30');

    expect(local, isNotNull);
    expect(local!.hour, 14);
    expect(local.minute, 30);
    expect(local.isUtc, isFalse);
  });

  test('the schedule fields split the date and the time', () {
    final fields = scheduleFields(DateTime(2026, 10, 29, 9, 5));

    expect(fields.date, '2026-10-29');
    expect(fields.time, '09:05');
  });
}
