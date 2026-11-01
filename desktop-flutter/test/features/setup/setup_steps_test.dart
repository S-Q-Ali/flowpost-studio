import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/setup/domain/setup_steps.dart';
import 'package:flutter_test/flutter_test.dart';

/// Walks the whole step list: the UI, the client and the server allowlist are
/// all built from this data, so the data itself has to hold still.
void main() {
  final serverStep = setupSteps[setupIdServer]!;
  final licenseStep = setupSteps[setupIdLicense]!;

  group('the tracks', () {
    test('an end user is asked for the server and the license only', () {
      expect(setupStepsFor(SetupTrack.endUser).map((s) => s.id).toList(), [
        setupIdServer,
        setupIdLicense,
      ]);
    });

    test('the operator track goes in the order the server needs it', () {
      expect(setupStepsFor(SetupTrack.operator).map((s) => s.id).toList(), [
        setupIdServer,
        setupIdDeploy,
        setupIdCaptions,
        setupIdMedia,
        setupIdGoogle,
        setupIdMeta,
        setupIdTikTok,
        setupIdLinkedIn,
        setupIdLicense,
      ]);
    });

    test('every step has a why and a cost line', () {
      for (final step in setupSteps.values) {
        expect(step.why, isNotEmpty, reason: '${step.id} has no why');
        expect(step.cost, isNotEmpty, reason: '${step.id} has no cost line');
      }
    });

    test('no step is named twice', () {
      final ids = setupSteps.values.map((s) => s.id).toSet();
      expect(ids.length, setupSteps.length);
    });
  });

  group('the fields', () {
    test('a step never names one field twice', () {
      for (final step in setupSteps.values) {
        final names = step.fields.map((f) => f.name).toSet();
        expect(names.length, step.fields.length, reason: step.id);
      }
    });

    test('the server keys are named the way the functions read them', () {
      expect(serverNamesOf(setupSteps[setupIdCaptions]!), ['GROQ_API_KEY']);
      expect(serverNamesOf(setupSteps[setupIdMedia]!), [
        'R2_ENDPOINT',
        'R2_ACCESS_KEY',
        'R2_SECRET_KEY',
        'R2_BUCKET',
        'R2_PUBLIC_URL',
      ]);
      expect(serverNamesOf(setupSteps[setupIdGoogle]!), [
        'YT_CLIENT_ID',
        'YT_CLIENT_SECRET',
        'GD_CLIENT_ID',
        'GD_CLIENT_SECRET',
      ]);
      expect(serverNamesOf(setupSteps[setupIdMeta]!), [
        'IG_APP_ID',
        'IG_APP_SECRET',
        'FB_APP_ID',
        'FB_APP_SECRET',
      ]);
      expect(serverNamesOf(setupSteps[setupIdTikTok]!), [
        'TIKTOK_CLIENT_KEY',
        'TIKTOK_CLIENT_SECRET',
      ]);
      expect(serverNamesOf(setupSteps[setupIdLinkedIn]!), [
        'LINKEDIN_CLIENT_ID',
        'LINKEDIN_CLIENT_SECRET',
      ]);
    });

    test('a key or a secret is obscured, and nothing else is', () {
      for (final step in setupSteps.values) {
        for (final field in step.fields) {
          final isSecret =
              field.store == SetupFieldStore.onServer &&
              (field.name.contains('SECRET') || field.name.endsWith('_KEY'));
          expect(
            field.style,
            isSecret ? SetupFieldStyle.secret : SetupFieldStyle.plain,
            reason: '${step.id}.${field.name}',
          );
        }
      }
    });

    test('the values for this PC stay on this PC', () {
      for (final step in setupSteps.values) {
        for (final field in step.fields) {
          final isLocal =
              field.name.startsWith('SUPABASE_') ||
              field.name == 'UPDATE_MANIFEST_URL';
          expect(
            field.store,
            isLocal ? SetupFieldStore.onThisMachine : SetupFieldStore.onServer,
            reason: field.name,
          );
        }
      }
    });
  });

  group('validation', () {
    test('the Supabase rules are the ones the app already has', () {
      final url = fieldOf(serverStep, 'SUPABASE_URL');
      expect(setupFieldProblem(url, 'http://project.supabase.co'), isNotNull);
      expect(setupFieldProblem(url, 'https://project.supabase.co'), isNull);

      final key = fieldOf(serverStep, 'SUPABASE_ANON_KEY');
      expect(
        setupFieldProblem(key, 'sb_secret_123'),
        configFieldProblem(ConfigField.supabaseAnonKey, 'sb_secret_123'),
      );
    });

    test('a required field refuses nothing and an optional one takes it', () {
      final endpoint = fieldOf(serverStep, 'UPDATE_MANIFEST_URL');
      expect(setupFieldProblem(endpoint, ''), isNull);
      expect(
        setupFieldProblem(endpoint, 'ftp://flowpost.test/m.json'),
        isNotNull,
      );
      expect(
        setupFieldProblem(endpoint, 'https://flowpost.test/m.json'),
        isNull,
      );

      final groq = fieldOf(setupSteps[setupIdCaptions]!, 'GROQ_API_KEY');
      expect(setupFieldProblem(groq, '   '), isNotNull);
      expect(setupFieldProblem(groq, 'gsk_abc'), isNull);
    });

    test('the R2 host is a name, not an address', () {
      final host = fieldOf(setupSteps[setupIdMedia]!, 'R2_PUBLIC_URL');
      // The function builds `https://<value>/<key>`, so a scheme would double.
      expect(setupFieldProblem(host, 'pub-abc123.r2.dev'), isNull);
      expect(setupFieldProblem(host, 'https://pub-abc123.r2.dev'), isNotNull);
      expect(setupFieldProblem(host, 'pub abc.r2.dev'), isNotNull);
      expect(setupFieldProblem(host, 'localhost'), isNull);
    });

    test('a bucket name follows the object-storage rules', () {
      final bucket = fieldOf(setupSteps[setupIdMedia]!, 'R2_BUCKET');
      expect(setupFieldProblem(bucket, 'flowpost-media'), isNull);
      expect(setupFieldProblem(bucket, 'Flowpost_Media'), isNotNull);
      expect(setupFieldProblem(bucket, '-flowpost'), isNotNull);
      expect(setupFieldProblem(bucket, 'ab'), isNotNull);
      expect(setupFieldProblem(bucket, 'a' * 64), isNotNull);
    });

    test('an id and a secret refuse the spaces a paste brings', () {
      final id = fieldOf(setupSteps[setupIdGoogle]!, 'YT_CLIENT_ID');
      expect(
        setupFieldProblem(id, '1234-abc.apps.googleusercontent.com'),
        isNull,
      );
      expect(setupFieldProblem(id, ''), isNotNull);
      expect(setupFieldProblem(id, 'two words'), isNotNull);
    });
  });

  group('what the step tells the user to do', () {
    test('the callback links are the ones the functions send', () {
      expect(
        callbackUrisOf(setupSteps[setupIdGoogle]!, 'https://p.supabase.co'),
        [
          'https://p.supabase.co/functions/v1/youtube-auth?action=callback',
          'https://p.supabase.co/functions/v1/google-drive-auth?action=callback',
        ],
      );
      // Instagram and TikTok take the plain function URL, no query.
      expect(
        callbackUrisOf(setupSteps[setupIdMeta]!, 'https://p.supabase.co'),
        [
          'https://p.supabase.co/functions/v1/instagram-auth',
          'https://p.supabase.co/functions/v1/facebook-auth?action=callback',
        ],
      );
      expect(
        callbackUrisOf(setupSteps[setupIdTikTok]!, 'https://p.supabase.co'),
        ['https://p.supabase.co/functions/v1/tiktok-auth'],
      );
      expect(
        callbackUrisOf(setupSteps[setupIdLinkedIn]!, 'https://p.supabase.co'),
        ['https://p.supabase.co/functions/v1/linkedin-auth?action=callback'],
      );
    });

    test('a step with nothing to fill has something to run', () {
      expect(setupSteps[setupIdDeploy]!.fields, isEmpty);
      expect(setupSteps[setupIdDeploy]!.instructions, isNotEmpty);
      expect(licenseStep.fields, isEmpty);
    });

    test('every step says how it is proven', () {
      expect(serverStep.check, SetupCheck.connection);
      expect(licenseStep.check, SetupCheck.license);
      for (final id in [
        setupIdDeploy,
        setupIdCaptions,
        setupIdMedia,
        setupIdGoogle,
        setupIdMeta,
        setupIdTikTok,
        setupIdLinkedIn,
      ]) {
        expect(setupSteps[id]!.check, SetupCheck.serverConfig, reason: id);
      }
    });

    test('the operator can leave any step but the server', () {
      for (final step in setupSteps.values) {
        expect(step.skippable, step.id != setupIdServer, reason: step.id);
      }
    });
  });
}

SetupField fieldOf(SetupStep step, String name) =>
    step.fields.firstWhere((f) => f.name == name);
