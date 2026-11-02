import 'package:flowpost_desktop/core/shell/protocol_registration.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingRegistry {
  _RecordingRegistry({required this.queryResult});

  RegistryResult queryResult;
  final List<List<String>> calls = [];
  bool failAdd = false;

  Future<RegistryResult> run(List<String> arguments) async {
    calls.add(arguments);
    if (arguments.first == 'query') return queryResult;
    if (failAdd) return const RegistryResult(exitCode: 1);
    return const RegistryResult(exitCode: 0);
  }
}

void main() {
  const exe =
      r'C:\Users\admin\AppData\Local\Programs\FlowPost Studio\flowpost.exe';
  const command = '"$exe" "%1"';
  const key = r'HKCU\Software\Classes\flowpost';

  test('an unregistered PC gets the whole protocol key', () async {
    final registry = _RecordingRegistry(
      queryResult: const RegistryResult(exitCode: 1),
    );

    final done = await ProtocolRegistrar(
      exePath: exe,
      run: registry.run,
    ).ensureRegistered();

    expect(done, isTrue);
    expect(registry.calls.length, 5);
    expect(registry.calls[0].first, 'query');

    final adds = registry.calls.skip(1).toList();
    expect(adds[0], [
      'add',
      key,
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      'URL:FlowPost Protocol',
      '/f',
    ]);
    expect(adds[1], [
      'add',
      key,
      '/v',
      'URL Protocol',
      '/t',
      'REG_SZ',
      '/d',
      '',
      '/f',
    ]);
    expect(adds[2], [
      'add',
      '$key\\DefaultIcon',
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      '$exe,0',
      '/f',
    ]);
    expect(adds[3], [
      'add',
      '$key\\shell\\open\\command',
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      command,
      '/f',
    ]);
  });

  test('an already-registered PC is left alone', () async {
    final registry = _RecordingRegistry(
      queryResult: const RegistryResult(
        exitCode: 0,
        stdout:
            '\r\nHKEY_CURRENT_USER\\Software\\Classes\\flowpost\\shell\\open\\command\r\n'
            '    (Default)    REG_SZ    $command\r\n\r\n',
      ),
    );

    final done = await ProtocolRegistrar(
      exePath: exe,
      run: registry.run,
    ).ensureRegistered();

    expect(done, isTrue);
    expect(registry.calls.length, 1);
  });

  test('a command pointing at another copy is repaired', () async {
    final registry = _RecordingRegistry(
      queryResult: const RegistryResult(
        exitCode: 0,
        stdout: '    (Default)    REG_SZ    "C:\\Old\\flowpost.exe" "%1"\r\n',
      ),
    );

    final done = await ProtocolRegistrar(
      exePath: exe,
      run: registry.run,
    ).ensureRegistered();

    expect(done, isTrue);
    expect(registry.calls.last, [
      'add',
      '$key\\shell\\open\\command',
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      command,
      '/f',
    ]);
  });

  test('a refused write reports false instead of throwing', () async {
    final registry = _RecordingRegistry(
      queryResult: const RegistryResult(exitCode: 1),
    )..failAdd = true;

    final done = await ProtocolRegistrar(
      exePath: exe,
      run: registry.run,
    ).ensureRegistered();

    expect(done, isFalse);
  });
}
