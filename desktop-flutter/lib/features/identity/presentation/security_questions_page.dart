import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/identity_models.dart';
import '../identity_controller.dart';

/// The second factor for the administrator account: the two questions either
/// verified or set up on first use (SPEC-identity Flows).
class SecurityQuestionsPage extends ConsumerStatefulWidget {
  const SecurityQuestionsPage({super.key});

  @override
  ConsumerState<SecurityQuestionsPage> createState() =>
      _SecurityQuestionsPageState();
}

class _SecurityQuestionsPageState extends ConsumerState<SecurityQuestionsPage> {
  final TextEditingController _teacher = TextEditingController();
  final TextEditingController _date = TextEditingController();

  bool _busy = false;
  String? _error;
  String? _shownMessage;

  @override
  void dispose() {
    _teacher.dispose();
    _date.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    if (_busy) return;
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked == null) return;
    setState(() => _date.text = _isoDate(picked));
  }

  Future<void> _submit({required bool configured}) async {
    if (_busy) return;
    final teacher = _teacher.text.trim();
    final date = _date.text;
    if (teacher.isEmpty || date.isEmpty) {
      setState(() => _error = 'Answer both security questions.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final controller = ref.read(identityControllerProvider.notifier);
      if (configured) {
        await controller.verifyQuestions(
          favTeacher: teacher,
          bestNightDate: date,
        );
      } else {
        await controller.setQuestions(favTeacher: teacher, bestNightDate: date);
      }
    } on IdentityException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(identityControllerProvider.notifier).signOut();
    } on IdentityException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(identityControllerProvider).value;
    final questions = state is AwaitingQuestions ? state : null;
    final configured = questions?.questionsConfigured ?? true;

    final message = questions?.message;
    if (message != null && message != _shownMessage) {
      _shownMessage = message;
      _error ??= message;
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    configured
                        ? 'Security verification'
                        : 'Set up security questions',
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    configured
                        ? 'Answer both questions to unlock this PC.'
                        : 'Set up two security questions for additional '
                              'protection.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    key: const Key('questions-teacher'),
                    controller: _teacher,
                    enabled: !_busy,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: "What is your favorite teacher's name?",
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('questions-date'),
                    controller: _date,
                    enabled: !_busy,
                    readOnly: true,
                    onTap: _pickDate,
                    decoration: const InputDecoration(
                      labelText: 'What is the date of your best night ever?',
                      hintText: 'Pick a date',
                    ),
                  ),
                  if (_error case final error?) ...[
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        error,
                        key: const Key('questions-error'),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    key: const Key('questions-submit'),
                    onPressed: _busy
                        ? null
                        : () => _submit(configured: configured),
                    child: Text(
                      _busy
                          ? 'Checking…'
                          : configured
                          ? 'Unlock'
                          : 'Save and continue',
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    key: const Key('questions-signout'),
                    onPressed: _busy ? null : _signOut,
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _isoDate(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year.toString().padLeft(4, '0')}-$month-$day';
}
