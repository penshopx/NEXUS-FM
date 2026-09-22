import axe, { type RunOptions, type Result } from 'axe-core';
import { expect } from 'vitest';

const HIGH_IMPACT_LEVELS = new Set(['serious', 'critical']);

export async function expectNoHighImpactAccessibilityViolations(
  context: Element | Document = document.body,
  options?: RunOptions,
) {
  const { violations } = await axe.run(context, {
    resultTypes: ['violations'],
    ...options,
    rules: {
      ...options?.rules,
      // axe's color analysis requires a real canvas, which jsdom intentionally
      // does not provide. Disable only this visual rule in the jsdom helper;
      // semantic rules such as button-name, link-name, label, and
      // aria-dialog-name remain enabled.
      'color-contrast': { enabled: false },
    },
  });
  const highImpactViolations = violations.filter(
    (violation) => violation.impact && HIGH_IMPACT_LEVELS.has(violation.impact),
  );

  expect(
    highImpactViolations,
    highImpactViolations.map(formatAccessibilityViolation).join('\n\n'),
  ).toEqual([]);
}

export async function expectNoHighImpactColorContrastViolations(
  context: Element | Document = document.body,
) {
  const { violations } = await axe.run(context, {
    resultTypes: ['violations'],
    runOnly: {
      type: 'rule',
      values: ['color-contrast'],
    },
  });
  const highImpactViolations = violations.filter(
    (violation) => violation.impact && HIGH_IMPACT_LEVELS.has(violation.impact),
  );

  expect(
    highImpactViolations,
    highImpactViolations.map(formatAccessibilityViolation).join('\n\n'),
  ).toEqual([]);
}

function formatAccessibilityViolation(violation: Result) {
  const affectedNodes = violation.nodes
    .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary}`)
    .join('\n');
  return `${violation.id} (${violation.impact}): ${violation.help}\n${affectedNodes}`;
}