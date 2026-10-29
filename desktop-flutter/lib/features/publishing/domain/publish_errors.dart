import '../../../core/logging/app_logger.dart';

/// Why a publish attempt failed (SPEC-publishing "Error model").
enum PublishErrorCode {
  unauthorized,
  notSignedIn,
  invalidRequest,
  postNotFound,
  accountNotConnected,
  mediaMissing,
  wrongPlatform,
  platformRejected,
  timeout,
  network,
  unknown,
}

/// A failure with the sentence the screen shows.
class PublishFailure {
  const PublishFailure(this.code, this.message);

  final PublishErrorCode code;

  /// The sentence for the admin.
  final String message;

  @override
  String toString() => '$code: $message';
}

/// Turns what the service answered into one of the client's own codes.
///
/// The platform's own sentence is only kept when it says something the admin
/// can act on; everything else becomes one of the fixed sentences, so the
/// screen never shows a raw service answer.
PublishFailure mapPublishFailure({required int statusCode, String? text}) {
  final message = cleanFailureText(text);
  final lower = message.toLowerCase();
  if (statusCode == 401) {
    return const PublishFailure(
      PublishErrorCode.unauthorized,
      'Sign in again to publish.',
    );
  }
  if (lower.contains('post not found')) {
    return const PublishFailure(
      PublishErrorCode.postNotFound,
      'The post is no longer in the queue.',
    );
  }
  if (lower.startsWith('post is not for')) {
    return const PublishFailure(
      PublishErrorCode.wrongPlatform,
      'That post belongs to another platform.',
    );
  }
  if (_mentionsTheAccount(lower)) {
    return const PublishFailure(
      PublishErrorCode.accountNotConnected,
      'That account is no longer connected. Connect it again.',
    );
  }
  if (_mentionsTheMedia(lower)) {
    return const PublishFailure(
      PublishErrorCode.mediaMissing,
      'The media for this post is missing. Upload it again.',
    );
  }
  if (statusCode == 400 || statusCode == 405) {
    return const PublishFailure(
      PublishErrorCode.invalidRequest,
      'The post could not be prepared.',
    );
  }
  if (message.isEmpty) {
    return const PublishFailure(
      PublishErrorCode.unknown,
      'The publish failed. Try again.',
    );
  }
  return PublishFailure(PublishErrorCode.platformRejected, message);
}

/// The service says the account is gone: every function words it its own
/// way, but they all name the account.
bool _mentionsTheAccount(String lower) {
  if (!lower.contains('account') && !lower.contains('access token')) {
    return false;
  }
  return lower.contains('not found') ||
      lower.contains('not connected') ||
      lower.contains('disconnected');
}

/// The service says the media is gone.
bool _mentionsTheMedia(String lower) =>
    lower.contains('video not found') ||
    lower.contains('video url not found') ||
    lower.contains('missing file_url');

/// Makes a sentence from the service safe to show.
///
/// Control bytes and links go: a service can echo the media link back, and a
/// long answer would fill the screen.
String cleanFailureText(String? text) {
  if (text == null) return '';
  var cleaned = text.replaceAll(
    RegExp(r'https?://\S+', caseSensitive: false),
    '',
  );
  cleaned = stripControlCharacters(cleaned);
  cleaned = cleaned.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (cleaned.length > 240) cleaned = '${cleaned.substring(0, 240)}…';
  return cleaned;
}
