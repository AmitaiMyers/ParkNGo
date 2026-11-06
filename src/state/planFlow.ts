// The plan flow as an explicit state machine (docs/DESIGN.md §4.4). Pure: no I/O, fully unit-tested.
//
//   idle ──destination──► planning(stage) ──success──► done(selected)
//                            │   ▲                         │
//                            │   └──── any draft change ◄──┘   (previous results stay visible, dimmed)
//                            └──failure──► error(retry)
//
// Every draft change bumps `draftVersion`; the usePlanFlow hook re-plans when it changes.
// Each plan carries a requestId, so results of an outdated plan are ignored.

import type { PlanProgress, PlanResult } from '../lib/planner.ts';
import type { ParkedVehicle, Place, TripRequest, VehicleType } from '../lib/types.ts';

export type Origin = { kind: 'current' } | { kind: 'place'; place: Place };
export type Departure = { kind: 'now' } | { kind: 'at'; time: Date };
export type TripMode = 'park_and_ride' | 'return_to_vehicle';

export interface Draft {
  mode: TripMode;
  origin: Origin;
  destination: Place | null;
  vehicle: VehicleType;
  carryVehicle: boolean;
  departure: Departure;
  /** Return time as "HH:mm", or null when no return trip is wanted. */
  returnTime: string | null;
}

export interface PlanOutcome {
  mode: TripMode;
  request: TripRequest;
  result: PlanResult;
}

export type PlanStatus =
  | { kind: 'idle' }
  | { kind: 'planning'; requestId: number; progress: PlanProgress | null; previous: PlanOutcome | null }
  | { kind: 'done'; outcome: PlanOutcome }
  | { kind: 'error'; message: string; previous: PlanOutcome | null };

export interface FlowState {
  draft: Draft;
  draftVersion: number;
  status: PlanStatus;
  selectedOptionId: string | null;
  nextRequestId: number;
}

export type FlowAction =
  | { type: 'setOrigin'; origin: Origin }
  | { type: 'setDestination'; place: Place | null }
  | { type: 'swap' }
  | { type: 'setVehicle'; vehicle: VehicleType }
  | { type: 'setCarryVehicle'; carry: boolean }
  | { type: 'setDeparture'; departure: Departure }
  | { type: 'setReturnTime'; time: string | null }
  | { type: 'returnToVehicle'; parked: ParkedVehicle }
  | { type: 'retry' }
  | { type: 'planStarted'; requestId: number }
  | { type: 'planProgress'; requestId: number; progress: PlanProgress }
  | { type: 'planSucceeded'; requestId: number; outcome: PlanOutcome }
  | { type: 'planFailed'; requestId: number; message: string }
  | { type: 'select'; optionId: string };

export function initialFlowState(vehicle: VehicleType): FlowState {
  return {
    draft: { mode: 'park_and_ride', origin: { kind: 'current' }, destination: null, vehicle, carryVehicle: false, departure: { kind: 'now' }, returnTime: null },
    draftVersion: 0,
    status: { kind: 'idle' },
    selectedOptionId: null,
    nextRequestId: 1,
  };
}

/** The outcome currently on screen (also while re-planning or after an error), if any. */
export function visibleOutcome(status: PlanStatus): PlanOutcome | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'done':
      return status.outcome;
    case 'planning':
    case 'error':
      return status.previous;
  }
}

/** The option selected by default: the recommended one, or the single trip back to the vehicle. */
export function defaultSelection(outcome: PlanOutcome): string | null {
  if (outcome.mode === 'return_to_vehicle') {
    return outcome.result.transitOnly === null ? null : outcome.result.transitOnly.id;
  }
  return outcome.result.highlights === null ? null : outcome.result.highlights.balanced.id;
}

function withDraft(state: FlowState, draft: Draft): FlowState {
  if (draft.destination === null) {
    return { ...state, draft, draftVersion: state.draftVersion + 1, status: { kind: 'idle' }, selectedOptionId: null };
  }
  return { ...state, draft, draftVersion: state.draftVersion + 1 };
}

const isCurrentRequest = (status: PlanStatus, requestId: number): boolean => status.kind === 'planning' && status.requestId === requestId;

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  const draft = state.draft;
  switch (action.type) {
    case 'setOrigin':
      return withDraft(state, { ...draft, origin: action.origin });
    case 'setDestination':
      return withDraft(state, { ...draft, mode: 'park_and_ride', destination: action.place });
    case 'swap': {
      if (draft.origin.kind !== 'place' || draft.destination === null) {
        throw new Error('swap needs a chosen origin place and a destination');
      }
      return withDraft(state, { ...draft, origin: { kind: 'place', place: draft.destination }, destination: draft.origin.place });
    }
    case 'setVehicle':
      return withDraft(state, { ...draft, vehicle: action.vehicle, carryVehicle: action.vehicle === 'car' ? false : draft.carryVehicle });
    case 'setCarryVehicle':
      if (action.carry && draft.vehicle === 'car') {
        throw new Error('A car cannot be carried on public transport');
      }
      return withDraft(state, { ...draft, carryVehicle: action.carry });
    case 'setDeparture':
      return withDraft(state, { ...draft, departure: action.departure });
    case 'setReturnTime':
      return withDraft(state, { ...draft, returnTime: action.time });
    case 'returnToVehicle':
      return withDraft(state, {
        ...draft,
        mode: 'return_to_vehicle',
        origin: { kind: 'current' },
        destination: { name: action.parked.label, location: action.parked.location },
        departure: { kind: 'now' },
        returnTime: null,
      });
    case 'retry':
      return { ...state, draftVersion: state.draftVersion + 1 };
    case 'planStarted':
      return {
        ...state,
        nextRequestId: Math.max(state.nextRequestId, action.requestId + 1),
        status: { kind: 'planning', requestId: action.requestId, progress: null, previous: visibleOutcome(state.status) },
      };
    case 'planProgress':
      if (!isCurrentRequest(state.status, action.requestId) || state.status.kind !== 'planning') {
        return state;
      }
      return { ...state, status: { ...state.status, progress: action.progress } };
    case 'planSucceeded':
      if (!isCurrentRequest(state.status, action.requestId)) {
        return state;
      }
      return { ...state, status: { kind: 'done', outcome: action.outcome }, selectedOptionId: defaultSelection(action.outcome) };
    case 'planFailed':
      if (!isCurrentRequest(state.status, action.requestId)) {
        return state;
      }
      return { ...state, status: { kind: 'error', message: action.message, previous: visibleOutcome(state.status) } };
    case 'select':
      return { ...state, selectedOptionId: action.optionId };
  }
}

/** "HH:mm" → the first moment at that clock time after `after` (today or tomorrow). */
export function nextTimeAfter(after: Date, hhmm: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (match === null) {
    throw new Error(`Invalid time "${hhmm}"`);
  }
  const candidate = new Date(after);
  candidate.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (candidate <= after) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}
