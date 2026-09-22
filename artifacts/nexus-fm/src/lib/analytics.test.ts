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

  it('overrides the tracker URL without exposing active URL parameters', () => {
    window.history.replaceState(
      null,
      '',
      '/app/facilities/private-id?q=private-query&cursor=private-cursor',
    );
    const track = vi.fn();
    window.umami = { track };

    trackEvent(
      'registry_search_reset',
      { resource_type: 'building', page_depth: 3 },
      { url: '/app/registry' },
    );

    const transform = track.mock.calls[0]?.[0];
    expect(transform).toBeTypeOf('function');
    const event = transform({
      website: 'website-id',
      url: window.location.href,
      title: 'Registry',
    });

    expect(event).toEqual({
      website: 'website-id',
      title: 'Registry',
      name: 'registry_search_reset',
      data: { resource_type: 'building', page_depth: 3 },
      url: '/app/registry',
    });
    expect(JSON.stringify(event)).not.toContain('private-query');
    expect(JSON.stringify(event)).not.toContain('private-cursor');
    expect(JSON.stringify(event)).not.toContain('private-id');
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