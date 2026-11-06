import { useEffect, useReducer, useRef } from 'react';
import type { Dispatch } from 'react';
import { planReturnToVehicle, planTrip } from '../lib/planner.ts';
import type { PlannerApi, PlanResult, ProgressListener, TripOption } from '../lib/planner.ts';
import type { ParkingDataset, Place, Settings, TripRequest } from '../lib/types.ts';
import { flowReducer, initialFlowState, nextTimeAfter } from '../state/planFlow.ts';
import type { Draft, FlowAction, FlowState, PlanOutcome } from '../state/planFlow.ts';
import { currentLocation } from './useGeolocation.ts';

/** Small delay so quick successive changes (e.g. typing a time) start one plan, not several. */
const AUTO_PLAN_DELAY_MS = 250;

/** The single result of a "get me back to my car" plan, in the same shape as a park-and-ride result. */
function returnTripResult(option: TripOption | null): PlanResult {
  return {
    candidatesConsidered: 0,
    skippedFullOrClosed: 0,
    liveStatuses: new Map(),
    liveStatusError: null,
    options: [],
    highlights: null,
    vehicleOnly: null,
    transitOnly: option,
    carryOn: null,
  };
}

interface PlanContext {
  settings: Settings;
  dataset: ParkingDataset;
  api: PlannerApi;
  myLocationName: string;
}

async function runPlan(draft: Draft, context: PlanContext, onProgress: ProgressListener): Promise<PlanOutcome> {
  if (draft.destination === null) {
    throw new Error('runPlan needs a destination');
  }
  const origin: Place = draft.origin.kind === 'place' ? draft.origin.place : { name: context.myLocationName, location: await currentLocation() };
  const departure = draft.departure.kind === 'now' ? new Date() : draft.departure.time;
  const request: TripRequest = {
    origin,
    destination: draft.destination,
    vehicle: draft.vehicle,
    carryVehicle: draft.carryVehicle,
    departure,
    returnDeparture: draft.returnTime === null ? null : nextTimeAfter(departure, draft.returnTime),
  };
  if (draft.mode === 'return_to_vehicle') {
    const option = await planReturnToVehicle(origin, draft.destination, departure, context.settings, context.api);
    return { mode: draft.mode, request, result: returnTripResult(option) };
  }
  const result = await planTrip(request, context.settings, context.dataset.spots, context.dataset.avoidZones, context.api, onProgress);
  return { mode: draft.mode, request, result };
}

/** Owns the plan state machine and re-plans automatically whenever the trip or the settings change. */
export function usePlanFlow(context: PlanContext): [FlowState, Dispatch<FlowAction>] {
  const [state, dispatch] = useReducer(flowReducer, context.settings.vehicle, initialFlowState);
  const nextRequestId = useRef(1);
  const { draft, draftVersion } = state;

  useEffect(() => {
    if (draft.destination === null) {
      return;
    }
    const requestId = nextRequestId.current++;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'planStarted', requestId });
      runPlan(draft, context, (progress) => dispatch({ type: 'planProgress', requestId, progress })).then(
        (outcome) => dispatch({ type: 'planSucceeded', requestId, outcome }),
        (reason: Error) => dispatch({ type: 'planFailed', requestId, message: reason.message }),
      );
    }, AUTO_PLAN_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `draftVersion` changes with every draft change; settings/dataset changes also re-plan.
  }, [draft, draftVersion, context]);

  return [state, dispatch];
}
