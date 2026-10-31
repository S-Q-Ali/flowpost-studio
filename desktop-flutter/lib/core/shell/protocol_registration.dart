import 'dart:io';

/// One `reg.exe` call's outcome.
class RegistryResult {
  const RegistryResult({required this.exitCode, this.stdout = ''});

  final int exitCode;
  final String stdout;
}

typedef RegistryRunner = Future<RegistryResult> Function(
  List<String> arguments,
);

Future<RegistryResult> _runReg(List<String> arguments) async {
  final result = await Process.run('reg.exe', arguments);
  return RegistryResult(exitCode: result.exitCode, stdout: '${result.stdout}');
}

/// Points `flowpost://` at this executable under HKCU.
///
/// The installer writes the same keys; the portable ZIP has no installer, so
/// the app makes sure the callback can reach it on first run. Writes need no
/// elevation, and a matching command is left untouched.
class ProtocolRegistrar {
  ProtocolRegistrar({required this.exePath, RegistryRunner? run})
    : _run = run ?? _runReg;

  static const String key = r'HKCU\Software\Classes\flowpost';
  static const String commandKey = '$key\\shell\\open\\command';

  final String exePath;
  final RegistryRunner _run;

  String get _command => '"$exePath" "%1"';

  Future<bool> ensureRegistered() async {
    final current = await _run(['query', commandKey, '/ve']);
    if (current.exitCode == 0 && _commandOf(current.stdout) == _command) {
      return true;
    }

    final writes = [
      ['add', key, '/ve', '/t', 'REG_SZ', '/d', 'URL:FlowPost Protocol', '/f'],
      ['add', key, '/v', 'URL Protocol', '/t', 'REG_SZ', '/d', '', '/f'],
      [
        'add',
        '$key\\DefaultIcon',
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        '$exePath,0',
        '/f',
      ],
      ['add', commandKey, '/ve', '/t', 'REG_SZ', '/d', _command, '/f'],
    ];
    for (final write in writes) {
      final result = await _run(write);
      if (result.exitCode != 0) return false;
    }
    return true;
  }

  /// The default value of the command key, from `reg query` output.
  static String? _commandOf(String stdout) {
    for (final line in stdout.split('\n')) {
      final marker = line.indexOf('REG_SZ');
      if (marker != -1) return line.substring(marker + 'REG_SZ'.length).trim();
    }
    return null;
  }
}
