import 'connected_account.dart';

/// One platform a browser connect can start: the name the server takes, and
/// the label the screen shows.
typedef ConnectTarget = ({String serverPlatform, String label});

/// The connects the server is able to start.
///
/// Instagram and Facebook share a card and are two connects, so this list is
/// the server's names rather than the cards. MEGA is not in it: that sign-in
/// happens inside the browser tab and its auth function has no return link to
/// hand back to the desktop.
const List<ConnectTarget> connectTargets = [
  (serverPlatform: 'youtube', label: 'YouTube'),
  (serverPlatform: 'instagram', label: 'Instagram'),
  (serverPlatform: 'facebook', label: 'Facebook'),
  (serverPlatform: 'tiktok', label: 'TikTok'),
  (serverPlatform: 'linkedin', label: 'LinkedIn'),
  (serverPlatform: 'google_drive', label: 'Google Drive'),
];

/// Whether a platform the server named can be connected from this app.
bool canConnect(String serverPlatform) =>
    connectTargets.any((target) => target.serverPlatform == serverPlatform);

/// The name a message uses for a platform the server named. A row the desktop
/// shows but cannot connect still gets the name its card carries.
String connectLabelOf(String serverPlatform) {
  for (final target in connectTargets) {
    if (target.serverPlatform == serverPlatform) return target.label;
  }
  final card = socialPlatformOf(serverPlatform);
  return card == null ? serverPlatform : card.label;
}
