import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError, geocode } from '../src/lib/transitous.ts';

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const match = { name: 'Azrieli Center', lat: 32.07, lon: 34.79, areas: [{ name: 'Tel-Aviv', default: true }] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('routing client resilience', () => {
  it('retries a dropped request and a 503, then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okJson([match]));
    vi.stubGlobal('fetch', fetchMock);
    const pending = geocode('Azrieli', 'en');
    await vi.runAllTimersAsync();
    expect((await pending)[0]!.name).toBe('Azrieli Center, Tel-Aviv');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('min')).toBe('29.450000,34.200000');
  });

  it('gives up after the retries with a ServiceUnavailableError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));
    const pending = geocode('Azrieli', 'en').then(
      () => null,
      (error: Error) => error,
    );
    await vi.runAllTimersAsync();
    const error = await pending;
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error!.message).toContain('Load failed');
  });

  it('does not retry a real client error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(geocode('Azrieli', 'en')).rejects.toThrow(/Routing service error 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
