import { afterEach, describe, expect, it } from 'vitest';

import { expectNoHighImpactAccessibilityViolations } from './accessibility';

afterEach(() => {
  document.body.replaceChildren();
});

describe('expectNoHighImpactAccessibilityViolations', () => {
  it.each([
    ['button-name', '<button></button>'],
    ['link-name', '<a href="/facilities"></a>'],
    ['label', '<input type="text">'],
    ['aria-dialog-name', '<div role="dialog"></div>'],
  ])('still fails for the %s semantic rule', async (rule, markup) => {
    document.body.innerHTML = markup;

    let failure: unknown;
    try {
      await expectNoHighImpactAccessibilityViolations(document.body);
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).toContain(rule);
  });

  it('keeps color analysis disabled even when caller rules are merged', async () => {
    document.body.innerHTML =
      '<main><h1>Accessible content</h1><p>Readable text</p></main>';

    await expectNoHighImpactAccessibilityViolations(document.body, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
  });
});