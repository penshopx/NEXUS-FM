import { describe, expect, it } from 'vitest';
import { describeBindingScope, doesBindingScopeBroaden } from './binding-scope-change';

describe('doesBindingScopeBroaden', () => {
  it.each([
    ['SPACE', 'FACILITY'],
    ['ASSET', 'SPACE'],
    ['BUILDING', 'ORGANIZATION'],
    ['ORGANIZATION', 'PLATFORM'],
    ['FACILITY', 'PORTFOLIO'],
    ['TEAM', 'ORGANIZATION'],
    ['VENDOR_ASSIGNMENT', 'PORTFOLIO'],
    ['ASSIGNED', 'FACILITY'],
    ['OWNED_REQUEST', 'TEAM'],
    ['ASSET', 'TEAM'],
    ['SPACE', 'ASSIGNED'],
    ['FACILITY', 'VENDOR_ASSIGNMENT'],
  ] as const)('detects a broader change from %s to %s', (currentScope, nextScope) => {
    expect(doesBindingScopeBroaden(currentScope, nextScope)).toBe(true);
  });

  it.each([
    ['FACILITY', 'SPACE'],
    ['ORGANIZATION', 'FACILITY'],
    ['SPACE', 'SPACE'],
    ['ORGANIZATION', 'TEAM'],
    ['PORTFOLIO', 'VENDOR_ASSIGNMENT'],
  ] as const)('does not flag %s to %s as a known broadening', (currentScope, nextScope) => {
    expect(doesBindingScopeBroaden(currentScope, nextScope)).toBe(false);
  });
});

describe('describeBindingScope', () => {
  it('uses readable names while preserving stable IDs as a fallback', () => {
    expect(describeBindingScope('ORGANIZATION', null, { organizationName: 'Northwind' }))
      .toBe('Organization: Northwind');
    expect(describeBindingScope('SPACE', 'space-123', { organizationName: 'Northwind' }))
      .toBe('SPACE: space-123');
    expect(describeBindingScope('SPACE', 'space-123', {
      organizationName: 'Northwind',
      targetName: 'Boiler Room',
    })).toBe('SPACE: Boiler Room');
  });
});