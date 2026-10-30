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
  final scheme = flowPostLightTheme().colorScheme;
  const lightSurfaces = {
    'the screen': FlowPostColors.background,
    'a card': FlowPostColors.card,
  };

  test('labels on a filled button are readable', () {
    expect(
      contrast(scheme.onPrimary, scheme.primary),
      greaterThanOrEqualTo(4.5),
    );
  });

  test('primary-coloured text is readable on every surface', () {
    for (final surface in lightSurfaces.entries) {
      expect(
        contrast(FlowPostColors.primaryText, surface.value),
        greaterThanOrEqualTo(4.5),
        reason: 'primary text on ${surface.key}',
      );
    }
  });

  test('error text is readable on every surface', () {
    for (final surface in lightSurfaces.entries) {
      expect(
        contrast(scheme.error, surface.value),
        greaterThanOrEqualTo(4.5),
        reason: 'error on ${surface.key}',
      );
    }
  });

  test('a label on the error fill is readable', () {
    expect(contrast(scheme.onError, scheme.error), greaterThanOrEqualTo(4.5));
  });

  test('the published colour is readable on a card', () {
    expect(
      contrast(Colors.green.shade900, FlowPostColors.card),
      greaterThanOrEqualTo(4.5),
    );
  });

  test('a text field border stands out from the screen', () {
    for (final surface in lightSurfaces.entries) {
      expect(
        contrast(scheme.outline, surface.value),
        greaterThanOrEqualTo(3),
        reason: 'outline on ${surface.key}',
      );
    }
  });

  test('the queue and the calendar name the same colour for a status', () {
    expect(
      postStatusColor(PostStatus.scheduled, scheme),
      FlowPostColors.primaryText,
    );
    expect(
      postStatusColor(PostStatus.published, scheme),
      Colors.green.shade900,
    );
    expect(postStatusColor(PostStatus.failed, scheme), scheme.error);
  });
}
