import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/media/upload/data/upload_client.dart';
import 'package:flowpost_desktop/features/media/upload/domain/upload_processing.dart';
import 'package:flutter_test/flutter_test.dart';

final _endpoint = Uri.parse(
  'https://test.supabase.co/functions/v1/upload-local-file',
);

/// A transport that answers from memory.
class _FakeTransport implements UploadTransport {
  _FakeTransport({this.reply = _okReply});

  static const UploadReply _okReply = UploadReply(
    statusCode: 200,
    body: {
      'success': true,
      'videoId': 'video-1',
      'url': 'https://cdn.example.com/user/job-1.mp4',
      'filename': 'normalized.mp4',
      'size': 2048,
    },
  );

  UploadReply reply;
  Uri? url;
  String? token;
  MultipartBody? body;
  bool cancelled = false;
  final List<int> progress = [];

  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) async {
    this.url = url;
    this.body = body;
    this.token = token;
    await for (final chunk in body.openRead(
      onProgress: (sent) {
        progress.add(sent);
        onSent?.call(sent);
      },
    )) {
      chunk.length;
    }
    return reply;
  }

  @override
  void cancel() {
    cancelled = true;
  }
}

/// A transport that reports every single byte, the way a slow disk would.
class _ByteTransport implements UploadTransport {
  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) async {
    for (var sent = 1; sent <= body.fileLength; sent++) {
      onSent?.call(sent);
    }
    return _FakeTransport._okReply;
  }

  @override
  void cancel() {}
}

void main() {
  late Directory temp;
  late File file;

  setUp(() {
    temp = Directory.systemTemp.createTempSync('flowpost-upload');
    file = File('${temp.path}${Platform.pathSeparator}normalized.mp4');
    file.writeAsBytesSync(List<int>.generate(2048, (index) => index % 256));
  });

  tearDown(() => temp.deleteSync(recursive: true));

  UploadClient buildClient(
    UploadTransport transport, {
    String? token = 'session',
  }) {
    return UploadClient(
      endpoint: _endpoint,
      token: token,
      transport: transport,
    );
  }

  group('the multipart body', () {
    test('carries the file with its name and type', () async {
      final transport = _FakeTransport();
      await buildClient(transport).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      final text = utf8.decode(
        await transport.body!.openRead().expand((chunk) => chunk).toList(),
        allowMalformed: true,
      );
      expect(text, contains('name="file"'));
      expect(text, contains('filename="normalized.mp4"'));
      expect(text, contains('Content-Type: video/mp4'));
    });

    test('carries the idempotency key', () async {
      final transport = _FakeTransport();
      await buildClient(transport).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      final text = utf8.decode(
        await transport.body!.openRead().expand((chunk) => chunk).toList(),
        allowMalformed: true,
      );
      expect(text, contains('name="idempotency_key"'));
      expect(text, contains('job-1'));
    });

    test('the length covers the file and the headers', () async {
      final transport = _FakeTransport();
      await buildClient(transport).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      final body = transport.body!;
      final bytes = await body.openRead().expand((chunk) => chunk).toList();
      expect(body.contentLength, bytes.length);
      expect(body.contentLength, greaterThan(file.lengthSync()));
    });

    test('the file name cannot break out of the header', () async {
      final transport = _FakeTransport();
      await buildClient(transport).upload(
        file: file,
        fileName: 'a"\r\nX-Injected: 1.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      final text = utf8.decode(
        await transport.body!.openRead().expand((chunk) => chunk).toList(),
        allowMalformed: true,
      );
      // The name may not start a new header line.
      expect(text, isNot(contains('\r\nX-Injected')));
      final name = RegExp(r'filename="([^"]*)"').firstMatch(text)?.group(1);
      expect(name, isNotNull);
      expect(name, isNot(contains('\n')));
      expect(name, isNot(contains('\r')));
      expect(name, isNot(contains('"')));
    });
  });

  group('the client', () {
    test('without a token nothing is sent', () async {
      final transport = _FakeTransport();
      await expectLater(
        buildClient(transport, token: null).upload(
          file: file,
          fileName: 'normalized.mp4',
          contentType: 'video/mp4',
          idempotencyKey: 'job-1',
        ),
        throwsA(
          isA<UploadException>().having(
            (error) => error.message,
            'message',
            contains('Sign in'),
          ),
        ),
      );
      expect(transport.url, isNull);
    });

    test('the answer becomes the result', () async {
      final transport = _FakeTransport(
        reply: const UploadReply(
          statusCode: 200,
          body: {
            'success': true,
            'videoId': 'video-1',
            'url': 'https://cdn.example.com/user/job-1.mp4',
            'filename': 'normalized.mp4',
            'size': 2048,
          },
        ),
      );

      final result = await buildClient(transport).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      expect(result.videoId, 'video-1');
      expect(result.url, 'https://cdn.example.com/user/job-1.mp4');
      expect(result.filename, 'normalized.mp4');
      expect(result.size, 2048);
      expect(transport.url, _endpoint);
      expect(transport.token, 'session');
    });

    test('the error of the service is shown to the user', () async {
      final transport = _FakeTransport(
        reply: const UploadReply(
          statusCode: 500,
          body: {'error': 'R2 upload failed: 500'},
        ),
      );

      await expectLater(
        buildClient(transport).upload(
          file: file,
          fileName: 'normalized.mp4',
          contentType: 'video/mp4',
          idempotencyKey: 'job-1',
        ),
        throwsA(
          isA<UploadException>().having(
            (error) => error.message,
            'message',
            'R2 upload failed: 500',
          ),
        ),
      );
    });

    test('a failure without a message still says something', () async {
      final transport = _FakeTransport(
        reply: const UploadReply(statusCode: 502, body: {}),
      );

      await expectLater(
        buildClient(transport).upload(
          file: file,
          fileName: 'normalized.mp4',
          contentType: 'video/mp4',
          idempotencyKey: 'job-1',
        ),
        throwsA(
          isA<UploadException>().having(
            (error) => error.message,
            'message',
            contains('502'),
          ),
        ),
      );
    });

    test('an answer without a url is a readable failure', () async {
      final transport = _FakeTransport(
        reply: const UploadReply(statusCode: 200, body: {'success': true}),
      );

      await expectLater(
        buildClient(transport).upload(
          file: file,
          fileName: 'normalized.mp4',
          contentType: 'video/mp4',
          idempotencyKey: 'job-1',
        ),
        throwsA(isA<UploadException>()),
      );
    });

    test('the progress counts the bytes of the file', () async {
      final transport = _FakeTransport();
      final fractions = <double>[];
      await buildClient(transport).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
        onProgress: fractions.add,
      );

      expect(transport.progress.last, file.lengthSync());
      expect(transport.progress, isNotEmpty);
      expect(fractions.last, 1.0);
    });

    test('the progress is not reported for every chunk', () async {
      final fractions = <double>[];
      await buildClient(_ByteTransport()).upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
        onProgress: fractions.add,
      );

      // A large file comes off the disk in many chunks, and every chunk
      // would rebuild the screen.
      expect(fractions.length, lessThan(10));
      expect(fractions.last, 1.0);
    });
  });

  group('the http transport', () {
    test('the request carries the token, the type and the file', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final received = Completer<Map<String, dynamic>>();
      server.listen((request) async {
        final body = await request.fold<List<int>>(
          <int>[],
          (all, chunk) => all..addAll(chunk),
        );
        received.complete({
          'authorization': request.headers.value(
            HttpHeaders.authorizationHeader,
          ),
          'contentType': request.headers.contentType?.mimeType,
          'boundary': request.headers.contentType?.parameters['boundary'],
          'body': utf8.decode(body, allowMalformed: true),
          'length': body.length,
        });
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({
            'success': true,
            'videoId': 'video-1',
            'url': 'https://cdn.example.com/user/job-1.mp4',
            'filename': 'normalized.mp4',
            'size': 2048,
          }),
        );
        await request.response.close();
      });

      final client = UploadClient(
        endpoint: Uri.parse('http://127.0.0.1:${server.port}/upload'),
        token: 'session-token',
      );

      final result = await client.upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );

      final request = await received.future;
      expect(request['authorization'], 'Bearer session-token');
      expect(request['contentType'], 'multipart/form-data');
      expect(request['boundary'], isNotNull);
      expect(request['body'], contains('name="file"'));
      expect(request['body'], contains('job-1'));
      expect(result.videoId, 'video-1');
    });

    test('the request in flight can be aborted', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      // The server takes the body and never answers.
      server.listen((request) async {
        await request.drain<void>();
      });

      final transport = HttpUploadTransport();
      final client = UploadClient(
        endpoint: Uri.parse('http://127.0.0.1:${server.port}/upload'),
        token: 'session-token',
        transport: transport,
      );

      final upload = client.upload(
        file: file,
        fileName: 'normalized.mp4',
        contentType: 'video/mp4',
        idempotencyKey: 'job-1',
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      transport.cancel();

      await expectLater(
        upload,
        throwsA(anything),
      ).timeout(const Duration(seconds: 10));
    });
  });
}
