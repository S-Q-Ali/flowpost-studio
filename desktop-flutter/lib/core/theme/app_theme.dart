import 'package:flutter/material.dart';

/// Ported from the web app's `src/index.css` HSL tokens (SPEC-shell assumption 5),
/// converted to ARGB for the Material 3 `ColorScheme`.
///
/// [primary] is a fill, not a text colour: at 2.8:1 on the screen it fails
/// WCAG AA for small text. [primaryText] is the tone text and icons use, and
/// [onPrimary] the label that sits on the pink fill (SPEC-accessibility).
abstract final class FlowPostColors {
  static const Color primary = Color(0xFFE86AA8);
  static const Color primaryText = Color(0xFFA83C74);
  static const Color primaryForeground = Color(0xFF3D152B);
  static const Color background = Color(0xFFFEF7F8);
  static const Color foreground = Color(0xFF3D152B);
  static const Color card = Color(0xFFF3E5EC);
  static const Color muted = Color(0xFFEDE5EA);
  static const Color mutedForeground = Color(0xFF6D5762);
  static const Color destructive = Color(0xFFB3261E);
  static const Color border = Color(0xFFE3D1DA);
  static const Color outline = Color(0xFF8A6E7C);
  static const Color ring = Color(0xFFE86AA8);
}

/// The same screen in the dark: the web `.dark` block (src/index.css:70-107).
///
/// Two tokens sit a step above the web value. The web's 60%-lightness
/// destructive lands at 4.4:1 on this card, and its 25% border is invisible
/// there, so [destructive] uses 65% and [outline] the web's muted-foreground.
abstract final class FlowPostDarkColors {
  static const Color primary = Color(0xFFE467A6);
  static const Color primaryForeground = Color(0xFF240F1B);
  static const Color background = Color(0xFF1D0C14);
  static const Color foreground = Color(0xFFEBD6E0);
  static const Color card = Color(0xFF261720);
  static const Color mutedForeground = Color(0xFFB99FAE);
  static const Color destructive = Color(0xFFE46767);
  static const Color outline = Color(0xFF9E7B8C);
}

/// The two tones Material 3 has no slot for: the accent a screen uses for
/// text and icons, and the green that marks a post as published.
///
/// A theme carries its own pair, so a screen never asks which brightness it
/// is in to pick a colour.
@immutable
class FlowPostTones extends ThemeExtension<FlowPostTones> {
  const FlowPostTones({required this.primaryText, required this.success});

  final Color primaryText;
  final Color success;

  @override
  FlowPostTones copyWith({Color? primaryText, Color? success}) => FlowPostTones(
    primaryText: primaryText ?? this.primaryText,
    success: success ?? this.success,
  );

  @override
  ThemeExtension<FlowPostTones> lerp(
    covariant FlowPostTones? other,
    double t,
  ) => FlowPostTones(
    primaryText: Color.lerp(primaryText, other?.primaryText, t)!,
    success: Color.lerp(success, other?.success, t)!,
  );
}

/// `Colors.green.shade900`, spelled out so it can be a const.
const FlowPostTones lightTones = FlowPostTones(
  primaryText: FlowPostColors.primaryText,
  success: Color(0xFF1B5E20),
);

/// The web dark `--primary`, bright enough to be text, and
/// `Colors.green.shade400` for the published mark.
const FlowPostTones darkTones = FlowPostTones(
  primaryText: FlowPostDarkColors.primary,
  success: Color(0xFF66BB6A),
);

extension FlowPostTonesOf on ThemeData {
  /// The tone for accented text and icons.
  ///
  /// Falls back to the light token when a theme carries no tones, which is
  /// what a page test that pumps its own `MaterialApp` gets.
  Color get primaryText =>
      extension<FlowPostTones>()?.primaryText ?? lightTones.primaryText;

  /// The colour a published post is marked with.
  Color get success =>
      extension<FlowPostTones>()?.success ?? lightTones.success;
}

ThemeData flowPostLightTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: FlowPostColors.primary,
        brightness: Brightness.light,
      ).copyWith(
        primary: FlowPostColors.primary,
        onPrimary: FlowPostColors.primaryForeground,
        surface: FlowPostColors.card,
        onSurface: FlowPostColors.foreground,
        onSurfaceVariant: FlowPostColors.mutedForeground,
        error: FlowPostColors.destructive,
        onError: Colors.white,
        outline: FlowPostColors.outline,
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: FlowPostColors.background,
    focusColor: FlowPostColors.foreground.withValues(alpha: 0.12),
    extensions: const [lightTones],
  );
}

ThemeData flowPostDarkTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: FlowPostDarkColors.primary,
        brightness: Brightness.dark,
      ).copyWith(
        primary: FlowPostDarkColors.primary,
        onPrimary: FlowPostDarkColors.primaryForeground,
        surface: FlowPostDarkColors.card,
        onSurface: FlowPostDarkColors.foreground,
        onSurfaceVariant: FlowPostDarkColors.mutedForeground,
        error: FlowPostDarkColors.destructive,
        onError: FlowPostDarkColors.primaryForeground,
        outline: FlowPostDarkColors.outline,
      );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: FlowPostDarkColors.background,
    focusColor: FlowPostDarkColors.foreground.withValues(alpha: 0.12),
    extensions: const [darkTones],
  );
}
