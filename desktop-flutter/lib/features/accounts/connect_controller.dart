import 'dart:async';

import 'package:flutter/foundation.dart' show ValueNotifier;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../core/providers/app_providers.dart';
import '../../core/router/deep_links.dart';
import '../offline/offline_providers.dart';
import '../publishing/data/posts_repository.dart';
import 'accounts_providers.dart';
import 'data/connect_gateway.dart';
import 'data/pending_connect_store.dart';
import 'domain/connect_link.dart';
import 'domain/connect_target.dart';
import 'domain/connected_account.dart';

final Logger _log = Logger('connect');

/// The connects this app started and is still waiting on.
final Provider<PendingConnectStore> pendingConnectStoreProvider =
    Provider<PendingConnectStore>((ref) => PendingConnectStore());

/// Where a connect is started and a grant is revoked.
///
/// Null would mean the screen has nothing to call, so the session is not
/// checked here: the server reads the owner from it and refuses a call that
/// carries none, which the screen shows as its own message.
final Provider<ConnectGateway> connectGatewayProvider =
    Provider<ConnectGateway>((ref) {
      return ServerConnectGateway(
        sessionToken: ref.watch(sessionTokenProvider),
        transport: ref.watch(postsTransportProvider),
      );
    });

/// The `flowpost://connect-callback` links the window receives.
///
/// main wires this to the deep-link dispatcher. A link that arrives when the
/// process has just started carries a nonce no wait here knows, so it is not
/// taken for an answer: the accounts list read from the server is the truth.
final Provider<ValueNotifier<String?>> connectCallbackProvider =
    Provider<ValueNotifier<String?>>((ref) {
      final links = ValueNotifier<String?>(null);
      ref.onDispose(links.dispose);
      return links;
    });

/// How often an open wait asks the server what the browser did.
///
/// The link back from the browser is the fast answer. This is the answer for
/// the connect that never hands one over — a tab closed after the consent, a
/// browser that blocks the jump to the app, an OS handoff that goes nowhere.
/// The ask stops the moment the wait ends, so a normal connect makes one call.
final Provider<Duration> connectPollIntervalProvider =
    Provider<Duration>((ref) => const Duration(seconds: 3));

/// What the accounts screen shows about the connects this app started.
class ConnectState {
  const ConnectState({this.waitingOn, this.message});

  /// The server name of the platform whose connect is waiting on the browser.
  final String? waitingOn;

  /// The last connect or disconnect, in words the admin can read.
  final String? message;

  /// The name the waiting sheet uses.
  String? get waitingLabel =>
      waitingOn == null ? null : connectLabelOf(waitingOn!);
}

final NotifierProvider<ConnectController, ConnectState>
connectControllerProvider = NotifierProvider<ConnectController, ConnectState>(
  ConnectController.new,
);

/// Starts a browser connect, watches for its answer, and cuts a grant off.
///
/// The app never sees the platform's page: it hands the browser an address
/// that carries a nonce only this process knows. The answer comes back as the
/// link the browser opens, and — for a browser that never hands one over — as
/// what the callback recorded on the server. Both are matched to the nonce this
/// app made, so anything else is a stray tab, an old link, or a guess.
class ConnectController extends Notifier<ConnectState> {
  Timer? _giveUpTimer;
  Timer? _pollTimer;

  @override
  ConnectState build() {
    final links = ref.watch(connectCallbackProvider);
    links.addListener(_onLink);
    ref.onDispose(() {
      _giveUpTimer?.cancel();
      _pollTimer?.cancel();
      links.removeListener(_onLink);
    });
    return const ConnectState();
  }

  /// Opens a connect for [serverPlatform]: the nonce first, because the
  /// server stores it with the connect state, then the browser at the address
  /// the server answers with.
  Future<void> start(String serverPlatform) async {
    if (state.waitingOn != null) return;
    state = ConnectState(waitingOn: serverPlatform);
    final store = ref.read(pendingConnectStoreProvider);
    final wait = store.start(serverPlatform);
    try {
      final url = await ref
          .read(connectGatewayProvider)
          .connectUrl(platform: wait.platform, nonce: wait.nonce);
      final opened = await ref.read(urlLauncherProvider)(Uri.parse(url));
      if (!opened) {
        store.cancel(wait.platform);
        state = const ConnectState(
          message: 'The browser did not open. The connect did not start.',
        );
        return;
      }
    } on Object catch (error) {
      // Nothing is waiting, so nothing can be answered later.
      store.cancel(wait.platform);
      state = ConnectState(message: _wordsFor(error));
      return;
    }
    // The wait stays open, but not forever: an admin who closes the browser
    // after the address opens leaves the screen waiting on a connect nobody
    // will answer, and one wait at a time means no other platform can start.
    _giveUpTimer?.cancel();
    _giveUpTimer = Timer(store.lifetime, () => _gaveUp(wait.platform));
    // And not silent either: the callback writes what it decided, so a wait
    // the browser never hands back still ends on the browser's own answer.
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(ref.read(connectPollIntervalProvider), (_) {
      _askServer(wait.platform, wait.nonce);
    });
  }

  /// Asks the server what this connect's callback recorded. A call that fails
  /// is only a missed ask: the next one still comes, and the timeout still
  /// speaks, so a network that briefly drops says nothing to the admin.
  Future<void> _askServer(String serverPlatform, String nonce) async {
    final ConnectResult? result;
    try {
      result = await ref
          .read(connectGatewayProvider)
          .connectOutcome(platform: serverPlatform, nonce: nonce);
    } on Object catch (error) {
      _log.warning('The connect status did not answer: ${_wordsFor(error)}');
      return;
    }
    if (result == null) return;
    _finish(
      ConnectCallback(
        platform: serverPlatform,
        nonce: nonce,
        result: result,
      ),
    );
  }

  /// Closes a wait the browser never answered.
  void _gaveUp(String serverPlatform) {
    if (state.waitingOn != serverPlatform) return;
    _pollTimer?.cancel();
    ref.read(pendingConnectStoreProvider).cancel(serverPlatform);
    state = ConnectState(
      message:
          '${connectLabelOf(serverPlatform)} did not answer. '
          'Start the connect again.',
    );
  }

  /// Gives up the wait. A callback that still arrives is then a link for a
  /// connect this app is not waiting on, so it changes nothing.
  void stop() {
    _giveUpTimer?.cancel();
    _pollTimer?.cancel();
    final waiting = state.waitingOn;
    if (waiting != null) ref.read(pendingConnectStoreProvider).cancel(waiting);
    state = const ConnectState();
  }

  /// Revokes the grant and removes the row, then reads the list again: the
  /// server is what says whether the account is still there.
  Future<void> disconnect(ConnectedAccount account) async {
    try {
      await ref
          .read(connectGatewayProvider)
          .disconnect(
            platform: account.serverPlatform,
            accountId: account.accountId,
          );
    } on Object catch (error) {
      state = ConnectState(
        waitingOn: state.waitingOn,
        message: _wordsFor(error),
      );
      return;
    }
    state = ConnectState(
      message: 'Disconnected from ${connectLabelOf(account.serverPlatform)}.',
    );
    ref.invalidate(accountsControllerProvider);
  }

  void clearMessage() => state = ConnectState(waitingOn: state.waitingOn);

  /// Reads the link the window was handed. It is taken once: the same address
  /// arriving again — a reload, a bookmark — has no wait left to answer.
  void _onLink() {
    final links = ref.read(connectCallbackProvider);
    final raw = links.value;
    if (raw == null) return;
    links.value = null;
    final callback = parseConnectCallback(raw);
    if (callback == null) {
      // Only the shape is named, never the query: it can carry a code.
      _log.warning(
        'Ignored a connect link that is not an answer: '
        '${describeDeepLink(raw)}',
      );
      return;
    }
    _finish(callback);
  }

  /// Closes the wait [callback] answers. The store spends the wait, so the
  /// link and the server answer cannot both speak over each other: whichever
  /// arrives first is the one that ends it, and the other is a nonce this app
  /// is no longer waiting on.
  void _finish(ConnectCallback callback) {
    final store = ref.read(pendingConnectStoreProvider);
    final answer = store.answer(callback);
    if (answer != ConnectAnswer.trusted && answer != ConnectAnswer.expired) {
      // A nonce this app never made, or one already answered. The wait stays
      // as it was; the list the server gives is the truth either way.
      return;
    }
    // This is the answer to the wait, so nothing else needs to watch it.
    _giveUpTimer?.cancel();
    _pollTimer?.cancel();
    if (answer == ConnectAnswer.expired) {
      state = const ConnectState(
        message: 'That connect took too long. Start it again.',
      );
      return;
    }
    state = ConnectState(message: _outcomeOf(callback));
    ref.invalidate(accountsControllerProvider);
  }

  String _outcomeOf(ConnectCallback callback) => switch (callback.result) {
    ConnectResult.connected =>
      'Connected to ${connectLabelOf(callback.platform)}.',
    ConnectResult.denied => 'The connect was cancelled in the browser.',
    ConnectResult.failed => 'The connect did not finish. Start it again.',
  };
}

String _wordsFor(Object error) => error is PostsException
    ? error.message
    : 'The server did not answer. Try again.';
