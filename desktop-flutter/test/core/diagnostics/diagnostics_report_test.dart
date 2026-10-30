import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flutter_test/flutter_test.dart';

const AppVersionInfo _version = AppVersionInfo(
  version: '1.0.0',
  buildNumber: '1',
);

DiagnosticsFacts facts({
  List<LocalFileFact> files = const [],
  List<LocalFileFact> broken = const [],
  List<String> logLines = const [],
  bool logsRead = true,
  bool signedIn = false,
  AppVersionInfo? version = _version,
}) => DiagnosticsFacts(
  generatedAt: DateTime.utc(2026, 10, 29, 14, 30, 12),
  version: version,
  osVersion: 'Windows 10.0.26300',
  locale: 'en-US',
  zoneName: 'Asia/Karachi',
  utcOffset: const Duration(hours: 5),
  signedIn: signedIn,
  files: files,
  brokenFiles: broken,
  logLines: logLines,
  logsRead: logsRead,
);

void main() {
  test('the header names the app, the clock and the session', () {
    final report = buildDiagnosticsReport(facts());

    expect(report, contains('FlowPost Studio diagnostics'));
    expect(report, contains('Generated 2026-10-29T14:30:12Z'));
    expect(report, contains('1.0.0 (1), Windows 10.0.26300, en-US'));
    expect(report, contains('UTC+05:00, Asia/Karachi'));
    expect(report, contains('Session   signed out'));
  });

  test('a version the app could not read says so instead of guessing', () {
    final report = buildDiagnosticsReport(facts(version: null));

    expect(report, contains('App       unknown, Windows 10.0.26300, en-US'));
  });

  test('a negative offset keeps its sign', () {
    final report = buildDiagnosticsReport(
      DiagnosticsFacts(
        generatedAt: DateTime.utc(2026, 10, 29),
        version: _version,
        osVersion: 'Windows 10.0.26300',
        locale: 'en-US',
        zoneName: 'America/New_York',
        utcOffset: const Duration(hours: -4, minutes: -30),
        signedIn: true,
        files: const [],
        brokenFiles: const [],
        logLines: const [],
        logsRead: true,
      ),
    );

    expect(report, contains('UTC-04:30, America/New_York'));
    expect(report, contains('Session   signed in'));
  });

  test('each local file carries its size, its time and its state', () {
    final report = buildDiagnosticsReport(
      facts(
        files: [
          LocalFileFact(
            name: 'cache.db',
            state: LocalFileState.ok,
            bytes: 421888,
            modifiedAt: DateTime.utc(2026, 10, 29, 14, 12),
          ),
          const LocalFileFact(name: 'drafts.db', state: LocalFileState.missing),
        ],
      ),
    );

    expect(
      report,
      contains('cache.db: 412 KB, written 2026-10-29T14:12:00Z, ok'),
    );
    expect(report, contains('drafts.db: missing'));
  });

  test('a drafts file that will not open says exactly that', () {
    final report = buildDiagnosticsReport(
      facts(
        files: const [
          LocalFileFact(
            name: 'drafts.db',
            state: LocalFileState.unreadable,
            bytes: 16384,
            modifiedAt: null,
          ),
        ],
      ),
    );

    expect(report, contains('drafts.db: 16 KB, cannot be opened'));
  });

  test('the renamed-broken files are listed under their own label', () {
    final report = buildDiagnosticsReport(
      facts(
        broken: [
          LocalFileFact(
            name: 'cache.corrupt-20261029-1432.db',
            state: LocalFileState.unreadable,
            bytes: 421888,
            modifiedAt: DateTime.utc(2026, 10, 29, 14, 32),
          ),
        ],
      ),
    );

    expect(
      report,
      contains(
        'Broken    cache.corrupt-20261029-1432.db: 412 KB, '
        '2026-10-29T14:32:00Z',
      ),
    );
  });

  test('only the tail of the log reaches the file', () {
    final lines = [for (var i = 1; i <= 250; i++) 'line $i'];
    final report = buildDiagnosticsReport(facts(logLines: lines));

    expect(report, contains('--- app.log (last 200 lines) ---'));
    expect(report, isNot(contains('line 50\n')));
    expect(report, contains('line 51'));
    expect(report, contains('line 250'));
  });

  test('a log that could not be read says so and still writes the rest', () {
    final report = buildDiagnosticsReport(facts(logsRead: false));

    expect(report, contains('--- app.log: could not be read ---'));
    expect(report, contains('Session   signed out'));
  });

  test('a secret or a path in a log line never reaches the file', () {
    final report = buildDiagnosticsReport(
      facts(
        logLines: [
          'GET https://x.test/auth?code=abc123&state=xyz',
          r'open C:\Users\Jane Doe\clip.mp4 failed',
          r'copy \\server\share\clip.mp4 failed',
          'token=supersecret',
        ],
      ),
    );

    expect(report, isNot(contains('abc123')));
    expect(report, isNot(contains('supersecret')));
    expect(report, isNot(contains('Jane Doe')));
    expect(report, isNot(contains(r'\\server')));
    expect(report, contains('the file'));
    expect(report, contains('[redacted]'));
  });

  test('the file says what it does not hold', () {
    final report = buildDiagnosticsReport(facts());

    expect(
      report,
      contains('This file holds no tokens, no captions and no file paths.'),
    );
  });
}
