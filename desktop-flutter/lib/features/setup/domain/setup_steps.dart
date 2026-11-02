import '../../../core/config/app_config.dart';

/// The guided setup: what each step asks for, why, and how it is proven.
///
/// Plain data on purpose. The wizard renders it, the client sends the names,
/// and the server's allowlist is the same list, so one file is the only place
/// a step can change (SPEC-setup).

/// Who is being set up. An end user never sees a key they cannot own.
enum SetupTrack { endUser, operator }

/// Where a value belongs after the step.
enum SetupFieldStore {
  /// This PC, in `credentials.json` — the app talks to it.
  onThisMachine,

  /// The server, in the operator config — the functions read it.
  onServer,
}

/// How the field is painted. A secret is obscured, never logged, and never
/// shown back once saved.
enum SetupFieldStyle { plain, secret }

/// Which rule a value is measured by.
enum SetupRule {
  supabaseUrl,
  anonKey,
  manifestUrl,
  httpsUrl,
  hostName,
  bucketName,
  identifier,
}

/// What "Test" asks for this step.
enum SetupCheck {
  /// The Supabase address and key the app is configured with.
  connection,

  /// The server's own report that this step's names have values.
  serverConfig,

  /// The license screen's activation.
  license,
}

class SetupField {
  const SetupField({
    required this.name,
    required this.label,
    required this.rule,
    this.store = SetupFieldStore.onServer,
    this.style = SetupFieldStyle.plain,
    this.optional = false,
    this.help,
  });

  /// The name the value is stored under, on this PC or on the server.
  final String name;
  final String label;
  final SetupRule rule;
  final SetupFieldStore store;
  final SetupFieldStyle style;

  /// An empty value is allowed, so the step can be left for later.
  final bool optional;

  /// Where the value is found.
  final String? help;
}

class SetupLink {
  const SetupLink({required this.label, required this.url});

  final String label;
  final String url;
}

class SetupStep {
  const SetupStep({
    required this.id,
    required this.title,
    required this.why,
    required this.cost,
    required this.check,
    this.fields = const [],
    this.links = const [],
    this.callbacks = const [],
    this.instructions = const [],
    this.skippable = true,
  });

  final String id;
  final String title;

  /// What the app does with this, in one sentence.
  final String why;

  /// What it costs the user. Free is worth saying out loud.
  final String cost;

  final List<SetupField> fields;
  final List<SetupLink> links;

  /// Paths added to the project address to make the OAuth redirect the
  /// platform asks you to register.
  final List<String> callbacks;

  /// What to run when there is nothing to type.
  final List<String> instructions;

  final SetupCheck check;

  /// False when the app cannot work without the step.
  final bool skippable;
}

const String setupIdServer = 'server';
const String setupIdDeploy = 'deploy';
const String setupIdCaptions = 'captions';
const String setupIdMedia = 'media';
const String setupIdGoogle = 'google';
const String setupIdMeta = 'meta';
const String setupIdTikTok = 'tiktok';
const String setupIdLinkedIn = 'linkedin';
const String setupIdLicense = 'license';

const Map<String, SetupStep> setupSteps = {
  setupIdServer: SetupStep(
    id: setupIdServer,
    title: 'Your server',
    why:
        'Every post, upload and caption goes through the edge functions on '
        'this Supabase project. Nothing else opens until the app can reach it.',
    cost: 'Supabase has a free plan, and a personal schedule fits inside it.',
    skippable: false,
    check: SetupCheck.connection,
    links: [
      SetupLink(
        label: 'Supabase dashboard',
        url: 'https://supabase.com/dashboard',
      ),
      SetupLink(
        label: 'The keys live under Project Settings → API',
        url: 'https://supabase.com/dashboard/project/_/settings/api',
      ),
    ],
    fields: [
      SetupField(
        name: 'SUPABASE_URL',
        label: 'Project address',
        rule: SetupRule.supabaseUrl,
        store: SetupFieldStore.onThisMachine,
        help: 'Project Settings → API → Project URL.',
      ),
      SetupField(
        name: 'SUPABASE_ANON_KEY',
        label: 'Anon key',
        rule: SetupRule.anonKey,
        store: SetupFieldStore.onThisMachine,
        help:
            'The public anon or publishable key. The service-role key stays '
            'on the server; the app refuses it.',
      ),
      SetupField(
        name: 'UPDATE_MANIFEST_URL',
        label: 'Update manifest (optional)',
        rule: SetupRule.manifestUrl,
        store: SetupFieldStore.onThisMachine,
        optional: true,
        help:
            'A JSON file naming the newest Windows build. Leave it empty to '
            'update by hand.',
      ),
    ],
  ),

  setupIdDeploy: SetupStep(
    id: setupIdDeploy,
    title: 'Deploy the functions',
    why:
        'The keys the next steps save are read by functions that have to be on '
        'the project first. This step is what you run, not what you type.',
    cost: 'The Supabase CLI and the free plan cover it.',
    check: SetupCheck.serverConfig,
    instructions: [
      'npx supabase login',
      'npx supabase link --project-ref <your-project-ref>',
      'npx supabase db push',
      'npx supabase functions deploy',
      'Set the server\'s own secrets on the server, never here: '
          'npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... '
          'TOKEN_ENCRYPTION_KEY=...',
      'docs/runbook.md walks through the same steps with the checks.',
    ],
  ),

  setupIdCaptions: SetupStep(
    id: setupIdCaptions,
    title: 'AI captions',
    why:
        'The Generate captions button asks Groq for the text. Publishing works '
        'without it, so this is the first step worth leaving for later.',
    cost: 'Groq gives a free key with a monthly allowance.',
    check: SetupCheck.serverConfig,
    links: [
      SetupLink(label: 'Groq console', url: 'https://console.groq.com/keys'),
    ],
    fields: [
      SetupField(
        name: 'GROQ_API_KEY',
        label: 'Groq API key',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
        help: 'starts with gsk_.',
      ),
    ],
  ),

  setupIdMedia: SetupStep(
    id: setupIdMedia,
    title: 'Where the media lives',
    why:
        'A video is stored in Cloudflare R2, and the platform pulls it from '
        'there when the post is published.',
    cost: 'R2 stores 10 GB free and charges nothing to read the files back.',
    check: SetupCheck.serverConfig,
    links: [
      SetupLink(
        label: 'Cloudflare dashboard',
        url: 'https://dash.cloudflare.com',
      ),
    ],
    fields: [
      SetupField(
        name: 'R2_ENDPOINT',
        label: 'S3 API endpoint',
        rule: SetupRule.httpsUrl,
        help: 'R2 → Manage R2 API Tokens → Endpoint URL.',
      ),
      SetupField(
        name: 'R2_ACCESS_KEY',
        label: 'Access key id',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
        help: 'Mint a token with the Objects:Write permission for the bucket.',
      ),
      SetupField(
        name: 'R2_SECRET_KEY',
        label: 'Secret access key',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
        help: 'Shown once, when the token is created.',
      ),
      SetupField(
        name: 'R2_BUCKET',
        label: 'Bucket name',
        rule: SetupRule.bucketName,
      ),
      SetupField(
        name: 'R2_PUBLIC_URL',
        label: 'Public hostname',
        rule: SetupRule.hostName,
        help: 'The bucket custom domain with no https:// - the server adds it.',
      ),
    ],
  ),

  setupIdGoogle: SetupStep(
    id: setupIdGoogle,
    title: 'Google - YouTube and Drive',
    why:
        'YouTube publishing and the Drive files the app reads come from one '
        'Google Cloud project with two OAuth clients.',
    cost:
        'Creating the clients costs nothing. Verification is what takes time.',
    check: SetupCheck.serverConfig,
    callbacks: [
      '/functions/v1/youtube-auth?action=callback',
      '/functions/v1/google-drive-auth?action=callback',
    ],
    links: [
      SetupLink(
        label: 'Credentials',
        url: 'https://console.cloud.google.com/apis/credentials',
      ),
    ],
    fields: [
      SetupField(
        name: 'YT_CLIENT_ID',
        label: 'YouTube client id',
        rule: SetupRule.identifier,
      ),
      SetupField(
        name: 'YT_CLIENT_SECRET',
        label: 'YouTube client secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
      SetupField(
        name: 'GD_CLIENT_ID',
        label: 'Drive client id',
        rule: SetupRule.identifier,
      ),
      SetupField(
        name: 'GD_CLIENT_SECRET',
        label: 'Drive client secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
    ],
  ),

  setupIdMeta: SetupStep(
    id: setupIdMeta,
    title: 'Instagram and Facebook',
    why:
        'Both are the same Meta app: the graph calls for Instagram and the Page '
        'posts read the same app id and secret.',
    cost:
        'Free to register. Until the app passes review, the consent screen '
        'warns and only your own testers can connect.',
    check: SetupCheck.serverConfig,
    callbacks: [
      '/functions/v1/instagram-auth',
      '/functions/v1/facebook-auth?action=callback',
    ],
    links: [
      SetupLink(
        label: 'Meta for developers',
        url: 'https://developers.facebook.com/apps',
      ),
    ],
    fields: [
      SetupField(
        name: 'IG_APP_ID',
        label: 'App id',
        rule: SetupRule.identifier,
        help:
            'The same id for Instagram and Facebook, unless you run two apps.',
      ),
      SetupField(
        name: 'IG_APP_SECRET',
        label: 'App secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
      SetupField(
        name: 'FB_APP_ID',
        label: 'Facebook app id',
        rule: SetupRule.identifier,
      ),
      SetupField(
        name: 'FB_APP_SECRET',
        label: 'Facebook app secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
    ],
  ),

  setupIdTikTok: SetupStep(
    id: setupIdTikTok,
    title: 'TikTok',
    why: 'The video posts to TikTok through the app registered here.',
    cost: 'Free to register; TikTok reviews an app before it goes public.',
    check: SetupCheck.serverConfig,
    callbacks: ['/functions/v1/tiktok-auth'],
    links: [
      SetupLink(
        label: 'TikTok for developers',
        url: 'https://developers.tiktok.com/apps',
      ),
    ],
    fields: [
      SetupField(
        name: 'TIKTOK_CLIENT_KEY',
        label: 'Client key',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
      SetupField(
        name: 'TIKTOK_CLIENT_SECRET',
        label: 'Client secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
    ],
  ),

  setupIdLinkedIn: SetupStep(
    id: setupIdLinkedIn,
    title: 'LinkedIn',
    why:
        'Posting to a profile or a Page uses a LinkedIn app with the sharing '
        'product turned on.',
    cost: 'Free to register. LinkedIn approves which products an app may use.',
    check: SetupCheck.serverConfig,
    callbacks: ['/functions/v1/linkedin-auth?action=callback'],
    links: [
      SetupLink(
        label: 'LinkedIn developers',
        url: 'https://developer.linkedin.com',
      ),
    ],
    fields: [
      SetupField(
        name: 'LINKEDIN_CLIENT_ID',
        label: 'Client id',
        rule: SetupRule.identifier,
      ),
      SetupField(
        name: 'LINKEDIN_CLIENT_SECRET',
        label: 'Client secret',
        rule: SetupRule.identifier,
        style: SetupFieldStyle.secret,
      ),
    ],
  ),

  setupIdLicense: SetupStep(
    id: setupIdLicense,
    title: 'Unlock this machine',
    why:
        'The key is what the server signs the session with. Until it is '
        'active, the app opens on the license screen and nothing else.',
    cost: 'One key per machine, from the FlowPost license page.',
    check: SetupCheck.license,
    instructions: [
      'Enter the key on the license screen. The app asks the server to confirm '
          'it and keeps the grant on this PC.',
    ],
  ),
};

/// The steps a track walks, in order.
List<SetupStep> setupStepsFor(SetupTrack track) => switch (track) {
  SetupTrack.endUser => [
    setupSteps[setupIdServer]!,
    setupSteps[setupIdLicense]!,
  ],
  SetupTrack.operator => [
    setupSteps[setupIdServer]!,
    setupSteps[setupIdDeploy]!,
    setupSteps[setupIdCaptions]!,
    setupSteps[setupIdMedia]!,
    setupSteps[setupIdGoogle]!,
    setupSteps[setupIdMeta]!,
    setupSteps[setupIdTikTok]!,
    setupSteps[setupIdLinkedIn]!,
    setupSteps[setupIdLicense]!,
  ],
};

/// The names this step stores on the server, in field order.
List<String> serverNamesOf(SetupStep step) => step.fields
    .where((f) => f.store == SetupFieldStore.onServer)
    .map((f) => f.name)
    .toList();

/// The redirect URIs to register with the platform, from the project address
/// the user typed. A trailing slash in that address would land inside the URL.
List<String> callbackUrisOf(SetupStep step, String supabaseUrl) {
  final base = supabaseUrl.trim();
  final withoutSlash = base.endsWith('/')
      ? base.substring(0, base.length - 1)
      : base;
  return step.callbacks.map((path) => '$withoutSlash$path').toList();
}

/// Why [value] cannot be used for [field], or null when it can.
///
/// The Supabase pair is measured by the rules the app already has, so the
/// wizard and a saved file cannot drift apart (SPEC-credentials Decision 4).
String? setupFieldProblem(SetupField field, String value) {
  switch (field.rule) {
    case SetupRule.supabaseUrl:
      return configFieldProblem(ConfigField.supabaseUrl, value);
    case SetupRule.anonKey:
      return configFieldProblem(ConfigField.supabaseAnonKey, value);
    case SetupRule.manifestUrl:
      return configFieldProblem(ConfigField.updateManifestUrl, value);
    case SetupRule.httpsUrl:
      return _emptyOr(field, value, httpsUrlProblem);
    case SetupRule.hostName:
      return _emptyOr(field, value, _hostProblem);
    case SetupRule.bucketName:
      return _emptyOr(field, value, _bucketProblem);
    case SetupRule.identifier:
      return _emptyOr(field, value, _identifierProblem);
  }
}

typedef _Rule = String? Function(String value);

String? _emptyOr(SetupField field, String value, _Rule rule) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return field.optional ? null : '${field.label} is required.';
  }
  return rule(trimmed);
}

String? _hostProblem(String value) {
  if (value.contains(RegExp(r'\s')) ||
      value.contains('/') ||
      value.contains(':')) {
    return 'Give the hostname only, for example pub-abc123.r2.dev';
  }
  return null;
}

String? _bucketProblem(String value) {
  if (!RegExp(r'^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$').hasMatch(value)) {
    return 'Use 3 to 63 lowercase letters, digits, dots or hyphens, starting '
        'and ending with a letter or digit.';
  }
  return null;
}

String? _identifierProblem(String value) {
  if (value.contains(RegExp(r'\s'))) {
    return 'Remove the spaces - a pasted key often brings one.';
  }
  if (value.length > 255) return 'That is longer than any key here.';
  return null;
}
