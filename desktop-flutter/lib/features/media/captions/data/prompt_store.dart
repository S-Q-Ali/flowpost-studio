import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../domain/caption_prompt.dart';

const String promptFileName = 'custom_prompt.json';

/// The prompt store persists a creator's custom caption prompt or returns
/// the high-converting SEO viral fallback prompt when none is set.
class PromptStore {
  PromptStore({Future<Directory> Function()? folder})
      : _folder = folder ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _folder;

  Future<File> _file() async {
    final folder = await _folder();
    return File(p.join(folder.path, promptFileName));
  }

  Future<MasterPrompt> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return defaultMasterPrompt;
      final text = await file.readAsString();
      final data = jsonDecode(text);
      if (data is! Map<String, dynamic>) return defaultMasterPrompt;

      return MasterPrompt(
        strictRules: data['strict_rules'] as String? ?? defaultMasterPrompt.strictRules,
        outputFormat: data['output_format'] as String? ?? defaultMasterPrompt.outputFormat,
        exampleOutput: data['example_output'] as String? ?? defaultMasterPrompt.exampleOutput,
        hashtags: data['hashtags'] as String? ?? defaultMasterPrompt.hashtags,
        generationInstruction: data['generation_instruction'] as String? ?? defaultMasterPrompt.generationInstruction,
      );
    } catch (_) {
      return defaultMasterPrompt;
    }
  }

  Future<bool> write(MasterPrompt prompt) async {
    try {
      final file = await _file();
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode(prompt.toJson()), flush: true);
      if (await file.exists()) await file.delete();
      await tmp.rename(file.path);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> clear() async {
    try {
      final file = await _file();
      if (await file.exists()) await file.delete();
      return true;
    } catch (_) {
      return false;
    }
  }
}

final promptStoreProvider = Provider<PromptStore>((ref) => PromptStore());

final activePromptProvider =
    NotifierProvider<PromptNotifier, MasterPrompt>(PromptNotifier.new);

class PromptNotifier extends Notifier<MasterPrompt> {
  @override
  MasterPrompt build() {
    _load();
    return defaultMasterPrompt;
  }

  Future<void> _load() async {
    final loaded = await ref.read(promptStoreProvider).read();
    state = loaded;
  }

  Future<bool> updatePrompt(MasterPrompt prompt) async {
    final ok = await ref.read(promptStoreProvider).write(prompt);
    if (ok) state = prompt;
    return ok;
  }

  Future<bool> resetToDefault() async {
    final ok = await ref.read(promptStoreProvider).clear();
    if (ok) state = defaultMasterPrompt;
    return ok;
  }
}
