import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/identity_client.dart';

/// The single Supabase client; tests override it with a recording starter.
final identityClientProvider = Provider<IdentityClient>(
  (ref) => IdentityClient(),
);
