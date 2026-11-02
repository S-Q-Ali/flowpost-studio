import 'dart:io';

/// What the user reads when the request never reached the service.
///
/// A socket that would not open says nothing about the service or the file,
/// so the generic failure sentence would send them looking at both.
const String noConnectionMessage =
    'No connection — check your network and try again.';

/// True for a failure of the connection itself.
///
/// [SocketException] covers a host that does not resolve, a port nobody
/// listens on and a socket dropped mid-request; [HandshakeException] is the
/// TLS layer giving up before any answer. A timeout is not one of these: the
/// request may well have been received.
bool isNoConnection(Object error) =>
    error is SocketException || error is HandshakeException;
