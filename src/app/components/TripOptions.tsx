"use client";

import { useId } from "react";
import type { OptimizationGoal, PlaceType, TravelMode } from "@/domain/types";
import { Select } from "./ui/Select";
import { GOALS, ISOCHRONE_MINUTE_OPTIONS, PLACE_TYPE_OPTIONS, TRAVEL_MODES } from "./participants";

export interface TripOptionsProps {
  mode: TravelMode;
  goal: OptimizationGoal;
  minutes: number;
  /** "" = no place type (today's behaviour). */
  placeType: PlaceType | "";
  onModeChange: (mode: TravelMode) => void;
  onGoalChange: (goal: OptimizationGoal) => void;
  onMinutesChange: (minutes: number) => void;
  onPlaceTypeChange: (placeType: PlaceType | "") => void;
}

const GOAL_OPTIONS = GOALS.map((g) => ({ value: g.value, label: g.label }));
const PLACE_OPTIONS = [{ value: "", label: "Any (no place filter)" }, ...PLACE_TYPE_OPTIONS];
const MINUTE_OPTIONS = ISOCHRONE_MINUTE_OPTIONS.map((m) => ({
  value: String(m),
  label: `${m} minutes`,
}));

/**
 * Travel mode (segmented control: a native radio group, so arrow keys move
 * the choice and the group is one tab stop), goal and isochrone minutes.
 */
export function TripOptions({
  mode,
  goal,
  minutes,
  placeType,
  onModeChange,
  onGoalChange,
  onMinutesChange,
  onPlaceTypeChange,
}: TripOptionsProps) {
  const base = `trip${useId().replace(/:/g, "")}`;
  const legendId = `${base}-travel`;

  return (
    <div className="trip-options">
      <fieldset className="segmented" role="radiogroup" aria-labelledby={legendId}>
        <legend id={legendId} className="segmented__legend">
          Travel
        </legend>
        <div className="segmented__options">
          {TRAVEL_MODES.map((option) => {
            const id = `${base}-${option.value}`;
            return (
              <span key={option.value} className="segmented__option">
                <input
                  type="radio"
                  id={id}
                  name={`${base}-mode`}
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => onModeChange(option.value)}
                  className="segmented__input"
                />
                <label htmlFor={id} className="segmented__label">
                  {option.label}
                </label>
              </span>
            );
          })}
        </div>
      </fieldset>

      <Select
        label="Goal"
        options={GOAL_OPTIONS}
        value={goal}
        onChange={(event) => onGoalChange(event.target.value as OptimizationGoal)}
      />

      <Select
        label="Place type"
        hint="Optional. Only suggests meeting points with a place of this type within about 2 km."
        options={PLACE_OPTIONS}
        value={placeType}
        onChange={(event) => onPlaceTypeChange(event.target.value as PlaceType | "")}
      />

      <Select
        label="Minutes for isochrone"
        hint="The isochrone shades everywhere you can reach from a chosen meeting point in this time."
        options={MINUTE_OPTIONS}
        value={String(minutes)}
        onChange={(event) => onMinutesChange(Number(event.target.value))}
      />
    </div>
  );
}
