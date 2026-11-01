import 'package:flowpost_desktop/core/theme/app_theme.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/post_status_color.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// WCAG 2.1 contrast ratio between two opaque colours.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final light = la > lb ? la : lb;
  final dark = la > lb ? lb : la;
  return (light + 0.05) / (dark + 0.05);
}

void main() {
  const themes = {'light': flowPostLightTheme, 'dark': flowPostDarkTheme};

  for (final theme in themes.entries) {
    group('${theme.key} theme', () {
      final data = theme.value();
      final scheme = data.colorScheme;
      final surfaces = {
        'the screen': data.scaffoldBackgroundColor,
        'a card': scheme.surface,
      };

      test('labels on a filled button are readable', () {
        expect(
          contrast(scheme.onPrimary, scheme.primary),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('body text is readable on every surface', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(scheme.onSurface, surface.value),
            greaterThanOrEqualTo(4.5),
            reason: 'onSurface on ${surface.key}',
          );
        }
      });

      test('secondary text is readable on every surface', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(scheme.onSurfaceVariant, surface.value),
            greaterThanOrEqualTo(4.5),
            reason: 'onSurfaceVariant on ${surface.key}',
          );
        }
      });

      test('primary-coloured text is readable on every surface', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(data.primaryText, surface.value),
            greaterThanOrEqualTo(4.5),
            reason: 'primary text on ${surface.key}',
          );
        }
      });

      test('error text is readable on every surface', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(scheme.error, surface.value),
            greaterThanOrEqualTo(4.5),
            reason: 'error on ${surface.key}',
          );
        }
      });

      test('a label on the error fill is readable', () {
        expect(
          contrast(scheme.onError, scheme.error),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('the published colour is readable on every surface', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(data.success, surface.value),
            greaterThanOrEqualTo(4.5),
            reason: 'success on ${surface.key}',
          );
        }
      });

      test('a text field border stands out from the screen', () {
        for (final surface in surfaces.entries) {
          expect(
            contrast(scheme.outline, surface.value),
            greaterThanOrEqualTo(3),
            reason: 'outline on ${surface.key}',
          );
        }
      });

      test('the queue and the calendar name the same colour for a status', () {
        expect(postStatusColor(PostStatus.scheduled, data), data.primaryText);
        expect(postStatusColor(PostStatus.published, data), data.success);
        expect(postStatusColor(PostStatus.failed, data), scheme.error);
      });
    });
  }
}
