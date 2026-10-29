import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../domain/upload_processing.dart';

/// What the upload service answered.
class UploadReply {
  const UploadReply({required this.statusCode, required this.body});

  final int statusCode;

  /// The parsed JSON body. Empty when the answer was not JSON.
  final Map<String, dynamic> body;
}

/// The body of a multipart/form-data request.
///
/// One file part and one text field, which is all the upload service
/// reads.
class MultipartBody {
  MultipartBody({
    required this.file,
    required this.fileName,
    required this.contentType,
    required this.idempotencyKey,
    String? boundary,
  }) : boundary = boundary ?? _newBoundary();

  final String boundary;
  final File file;

  /// The name the service stores the file under.
  final String fileName;
  final String contentType;

  /// The key that makes a retry reuse the same object.
  final String idempotencyKey;

  /// The headers and the text field, in front of the file.
  late final String preamble = _buildPreamble();

  /// The closing boundary, behind the file.
  late final String epilogue = '--$boundary--\r\n';

  /// The number of bytes of the file.
  late final int fileLength = file.lengthSync();

  /// The number of bytes the whole body has.
  int get contentLength =>
      utf8.encode(preamble).length + fileLength + epilogue.length;

  /// The body as a stream, counting the bytes of the file on the way.
  Stream<List<int>> openRead({void Function(int sent)? onProgress}) async* {
    yield utf8.encode(preamble);
    var sent = 0;
    await for (final chunk in file.openRead()) {
      sent += chunk.length;
      onProgress?.call(sent);
      yield chunk;
    }
    yield utf8.encode(epilogue);
  }

  String _buildPreamble() {
    final buffer = StringBuffer()
      ..write('--$boundary\r\n')
      ..write('Content-Disposition: form-data; name="idempotency_key"\r\n')
      ..write('\r\n')
      ..write(idempotencyKey)
      ..write('\r\n')
      ..write('--$boundary\r\n')
      ..write(
        'Content-Disposition: form-data; name="file"; '
        'filename="${_safeFileName()}"\r\n',
      )
      ..write('Content-Type: $contentType\r\n')
      ..write('\r\n');
    return buffer.toString();
  }

  /// The file name goes into a header line, so it may not carry a quote or
  /// a line break.
  String _safeFileName() =>
      fileName.replaceAll(RegExp(r'[\x00-\x1f"\\/]'), '_').replaceAll(' ', '_');
}

String _newBoundary() {
  final random = Random().nextInt(0x1000000).toRadixString(16).padLeft(6, '0');
  return '----FlowPostUpload$random';
}

/// Carries one upload to the service.
abstract class UploadTransport {
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  });

  /// Aborts the request in flight.
  void cancel();
}

/// The one call the upload service makes.
abstract class UploadApi {
  Future<UploadResult> upload({
    required File file,
    required String fileName,
    required String contentType,
    required String idempotencyKey,
    UploadProgressCallback? onProgress,
  });

  /// Aborts the call in flight.
  void cancel();
}

/// Uploads one file to the `upload-local-file` edge function.
class UploadClient implements UploadApi {
  UploadClient({
    required this.endpoint,
    required this.token,
    UploadTransport? transport,
  }) : _transport = transport ?? HttpUploadTransport();

  /// The shortest time between two progress reports.
  ///
  /// The file comes off the disk in small chunks, and every chunk would
  /// rebuild the screen. A large file would do that a thousand times.
  static const Duration reportInterval = Duration(milliseconds: 250);

  final Uri endpoint;

  /// The session token. Null while there is no identity, and then nothing
  /// is sent.
  final String? token;

  final UploadTransport _transport;

  @override
  Future<UploadResult> upload({
    required File file,
    required String fileName,
    required String contentType,
    required String idempotencyKey,
    UploadProgressCallback? onProgress,
  }) async {
    final token = this.token;
    if (token == null || token.isEmpty) {
      throw const UploadException('Sign in required to upload.');
    }
    final body = MultipartBody(
      file: file,
      fileName: fileName,
      contentType: contentType,
      idempotencyKey: idempotencyKey,
    );
    var lastReport = DateTime.fromMillisecondsSinceEpoch(0);
    final reply = await _transport.send(
      url: endpoint,
      body: body,
      token: token,
      onSent: (sent) {
        final total = body.fileLength;
        final fraction = total == 0 ? 0.0 : (sent / total).clamp(0.0, 1.0);
        final now = DateTime.now();
        // The last report always goes out, so the bar ends at full.
        if (fraction < 1 && now.difference(lastReport) < reportInterval) {
          return;
        }
        lastReport = now;
        onProgress?.call(fraction);
      },
    );
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      final error = reply.body['error'];
      throw UploadException(
        error is String && error.isNotEmpty
            ? error
            : 'The upload service returned an error (${reply.statusCode}).',
      );
    }
    final videoId = reply.body['videoId'];
    final url = reply.body['url'];
    if (videoId is! String || url is! String) {
      throw const UploadException(
        'The upload service returned an unexpected answer.',
      );
    }
    final filename = reply.body['filename'];
    final size = reply.body['size'];
    return UploadResult(
      videoId: videoId,
      url: url,
      filename: filename is String ? filename : fileName,
      size: size is int ? size : 0,
    );
  }

  @override
  void cancel() => _transport.cancel();
}

/// Reports how many bytes of the file have been sent.
typedef UploadSentCallback = void Function(int sentBytes);

/// Reports how much of the file has been sent, from 0 to 1.
typedef UploadProgressCallback = void Function(double fraction);

/// How long one upload may take before the client gives up on it.
///
/// A 100 MB file on a slow line still fits: the shortest allowed speed is
/// about 170 KB/s.
const Duration defaultUploadTimeout = Duration(minutes: 10);

/// The real transport: one multipart request with the session token.
class HttpUploadTransport implements UploadTransport {
  HttpUploadTransport({HttpClient? client, this.timeout = defaultUploadTimeout})
    : _client = client ?? HttpClient();

  /// The whole call gets this long: the connection, the file and the answer.
  final Duration timeout;

  HttpClient _client;

  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) async {
    final client = _client;
    // One budget for the whole call: a connection, a file and an answer each
    // with a timeout of its own would make the wait several times as long as
    // it says, and a server that reads slowly would never end it.
    final clock = Stopwatch()..start();
    Duration left() => timeout - clock.elapsed;
    try {
      final request = await client.postUrl(url).timeout(left());
      request.headers.contentType = ContentType(
        'multipart',
        'form-data',
        parameters: {'boundary': body.boundary},
      );
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.contentLength = body.contentLength;
      await request
          .addStream(body.openRead(onProgress: onSent))
          .timeout(left());
      final response = await request.close().timeout(left());
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(left());
      Object? decoded;
      try {
        decoded = text.isEmpty ? null : jsonDecode(text);
      } on FormatException {
        decoded = null;
      }
      return UploadReply(
        statusCode: response.statusCode,
        body: decoded is Map ? Map<String, dynamic>.from(decoded) : const {},
      );
    } on TimeoutException {
      cancel();
      throw const UploadException('The upload did not answer. Try again.');
    }
  }

  @override
  void cancel() {
    // Closing the client forcible aborts the request in flight. A fresh one
    // is made for the next call, because a closed client cannot be reused.
    _client.close(force: true);
    _client = HttpClient();
  }
}
