import { describe, expect, it } from 'vitest';
import { effectiveSettings, flowReducer, initialFlowState, nextTimeAfter, preferencesFromSettings, visibleOutcome } from '../src/state/planFlow.ts';
import { settings as baseSettings } from './fixtures.ts';
import type { FlowState, PlanOutcome } from '../src/state/planFlow.ts';
import { nearestSnap } from '../src/ui/Sheet.tsx';
import type { PlanResult, TripOption } from '../src/lib/planner.ts';
import { makeRequest } from './fixtures.ts';

const AZRIELI = { name: 'Azrieli', location: { lat: 32.074, lng: 34.792 } };
const HOME = { name: 'Home', location: { lat: 32.18, lng: 34.87 } };

function outcomeWith(balancedId: string): PlanOutcome {
  const option = { id: balancedId } as TripOption;
  const result = {
    options: [option],
    highlights: { fastest: option, cheapest: option, balanced: option },
    transitOnly: null,
  } as unknown as PlanResult;
  return { mode: 'park_and_ride', request: makeRequest(), result };
}

function run(state: FlowState, ...actions: Parameters<typeof flowReducer>[1][]): FlowState {
  return actions.reduce(flowReducer, state);
}

describe('flowReducer', () => {
  const start = initialFlowState({ ...baseSettings, vehicle: 'car' });

  it('bumps the draft version on every draft change (which triggers auto-planning)', () => {
    const state = run(start, { type: 'setDestination', place: AZRIELI }, { type: 'setVehicle', vehicle: 'bicycle' });
    expect(state.draftVersion).toBe(2);
    expect(state.draft.destination).toEqual(AZRIELI);
  });

  it('clearing the destination returns to idle', () => {
    const state = run(start, { type: 'setDestination', place: AZRIELI }, { type: 'planStarted', requestId: 1 }, { type: 'setDestination', place: null });
    expect(state.status).toEqual({ kind: 'idle' });
  });

  it('selects the recommended option when a plan succeeds', () => {
    const state = run(start, { type: 'setDestination', place: AZRIELI }, { type: 'planStarted', requestId: 1 }, { type: 'planSucceeded', requestId: 1, outcome: outcomeWith('best') });
    expect(state.status.kind).toBe('done');
    expect(state.selectedOptionId).toBe('best');
  });

  it('ignores progress and results of an outdated plan', () => {
    const state = run(
      start,
      { type: 'setDestination', place: AZRIELI },
      { type: 'planStarted', requestId: 1 },
      { type: 'planStarted', requestId: 2 },
      { type: 'planSucceeded', requestId: 1, outcome: outcomeWith('stale') },
      { type: 'planProgress', requestId: 1, progress: { stage: 'routing', lotCount: 3 } },
    );
    expect(state.status).toMatchObject({ kind: 'planning', requestId: 2, progress: null });
    expect(state.nextRequestId).toBe(3);
  });

  it('keeps the previous results visible while re-planning and after an error', () => {
    const done = run(start, { type: 'setDestination', place: AZRIELI }, { type: 'planStarted', requestId: 1 }, { type: 'planSucceeded', requestId: 1, outcome: outcomeWith('a') });
    const replanning = run(done, { type: 'setVehicle', vehicle: 'scooter' }, { type: 'planStarted', requestId: 2 });
    expect(visibleOutcome(replanning.status)!.result.highlights!.balanced.id).toBe('a');
    const failed = run(replanning, { type: 'planFailed', requestId: 2, message: 'HTTP 503' });
    expect(failed.status).toMatchObject({ kind: 'error', message: 'HTTP 503' });
    expect(visibleOutcome(failed.status)).not.toBeNull();
  });

  it('switching to a car turns off carrying the vehicle; a car cannot be carried', () => {
    const state = run(start, { type: 'setVehicle', vehicle: 'scooter' }, { type: 'setCarryVehicle', carry: true }, { type: 'setVehicle', vehicle: 'car' });
    expect(state.draft.carryVehicle).toBe(false);
    expect(() => flowReducer(state, { type: 'setCarryVehicle', carry: true })).toThrow(/cannot be carried/);
  });

  it('swaps chosen places, and refuses to swap "My location"', () => {
    const state = run(start, { type: 'setOrigin', origin: { kind: 'place', place: HOME } }, { type: 'setDestination', place: AZRIELI }, { type: 'swap' });
    expect(state.draft.origin).toEqual({ kind: 'place', place: AZRIELI });
    expect(state.draft.destination).toEqual(HOME);
    expect(() => run(start, { type: 'setDestination', place: AZRIELI }, { type: 'swap' })).toThrow(/swap/);
  });

  it('"Get me back" plans from my location to the parked vehicle', () => {
    const state = run(start, { type: 'returnToVehicle', parked: { location: HOME.location, label: 'Reading West', savedAt: '2026-11-06T06:00:00Z' } });
    expect(state.draft.mode).toBe('return_to_vehicle');
    expect(state.draft.origin).toEqual({ kind: 'current' });
    expect(state.draft.destination!.name).toBe('Reading West');
  });
});

describe('nextTimeAfter', () => {
  it('returns today when the time is still ahead, otherwise tomorrow', () => {
    const morning = new Date(2026, 10, 8, 8, 0);
    expect(nextTimeAfter(morning, '17:30')).toEqual(new Date(2026, 10, 8, 17, 30));
    expect(nextTimeAfter(morning, '07:00')).toEqual(new Date(2026, 10, 9, 7, 0));
    expect(() => nextTimeAfter(morning, '7pm')).toThrow(/Invalid time/);
  });
});

describe('nearestSnap', () => {
  const heights = { peek: 150, half: 500, full: 850 };
  it('snaps to the nearest point, and a fast flick moves one point further', () => {
    expect(nearestSnap(480, 0, heights)).toBe('half');
    expect(nearestSnap(700, 0, heights)).toBe('full');
    expect(nearestSnap(520, 1.2, heights)).toBe('full');
    expect(nearestSnap(480, -1.2, heights)).toBe('peek');
  });
});

describe('trip preferences ("Are you OK with…")', () => {
  const settings = { ...baseSettings, maxWalkMeters: 800, pricePolicy: 'free_only' as const, avoidZoneIds: ['tel-aviv-yafo'] };

  it('start from Settings', () => {
    expect(preferencesFromSettings(settings)).toEqual({ walkOverOneKm: false, paidParking: false, parkInAvoidZones: false });
  });

  it('turn the answers into planner settings', () => {
    const yes = effectiveSettings(settings, { walkOverOneKm: true, paidParking: true, parkInAvoidZones: true }, ['tel-aviv-yafo']);
    expect(yes).toMatchObject({ maxWalkMeters: 2000, pricePolicy: 'allow_paid', avoidZoneIds: [] });
    const no = effectiveSettings({ ...settings, maxWalkMeters: 1500, avoidZoneIds: [] }, { walkOverOneKm: false, paidParking: false, parkInAvoidZones: false }, ['tel-aviv-yafo']);
    expect(no).toMatchObject({ maxWalkMeters: 1000, pricePolicy: 'free_only', avoidZoneIds: ['tel-aviv-yafo'] });
  });

  it('changing an answer re-plans (bumps the draft version)', () => {
    const state = flowReducer(initialFlowState(settings), { type: 'setPreference', key: 'paidParking', value: true });
    expect(state.draft.preferences.paidParking).toBe(true);
    expect(state.draftVersion).toBe(1);
  });
});
