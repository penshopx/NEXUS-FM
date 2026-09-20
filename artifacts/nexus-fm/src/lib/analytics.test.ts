import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from './analytics';

describe('trackEvent', () => {
  afterEach(() => {
    delete window.umami;
  });

  it('delegates events to the tracker injected by the deployment proxy', () => {
    const track = vi.fn();
    window.umami = { track };

    trackEvent('portfolio_import', {
      stage: 'validation_success',
      record_count: 8,
    });

    expect(track).toHaveBeenCalledWith('portfolio_import', {
      stage: 'validation_success',
      record_count: 8,
    });
  });

  it('is a safe no-op before the deployment tracker is available', () => {
    expect(() => trackEvent('portfolio_import', { stage: 'cancelled' })).not.toThrow();
  });

  it('contains tracker failures', () => {
    window.umami = {
      track: () => {
        throw new Error('tracker unavailable');
      },
    };

    expect(() => trackEvent('portfolio_import', { stage: 'commit_success' })).not.toThrow();
  });
});