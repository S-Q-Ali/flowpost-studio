import 'package:flowpost_desktop/features/setup/data/wizard_resume_store.dart';

/// Answers the place-mark the test names, and keeps what the wizard wrote.
class FakeWizardResumeStore implements WizardResumeStore {
  FakeWizardResumeStore([this.saved]);

  /// The place-mark the file holds.
  WizardResume? saved;

  /// When true the write fails, as it does on a full disk.
  bool refusesWrite = false;

  /// What the wizard asked to keep, in order.
  final List<WizardResume> writes = [];

  @override
  Future<WizardResume?> read() async => saved;

  @override
  Future<bool> write(WizardResume resume) async {
    if (refusesWrite) return false;
    writes.add(resume);
    saved = resume;
    return true;
  }
}
