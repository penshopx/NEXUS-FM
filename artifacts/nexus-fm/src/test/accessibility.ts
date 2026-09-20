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