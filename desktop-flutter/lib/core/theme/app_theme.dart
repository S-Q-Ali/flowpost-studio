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
        error: FlowPostColors.destructive,
        onError: Colors.white,
        outline: FlowPostColors.outline,
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: FlowPostColors.background,
    focusColor: FlowPostColors.foreground.withValues(alpha: 0.12),
  );
}
