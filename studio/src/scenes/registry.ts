import type { ComponentType } from "react";
import type { VideoFormat } from "../lib/formats.js";
import { TitleCard } from "./TitleCard.js";
import { FeatureCallout } from "./FeatureCallout.js";
import { CodeSnippet } from "./CodeSnippet.js";
import { ScreenRecording } from "./ScreenRecording.js";
import { BenchmarkChart } from "./BenchmarkChart.js";
import { ComparisonSplit } from "./ComparisonSplit.js";
import { CallToAction } from "./CallToAction.js";

export type SceneName =
  | "TitleCard"
  | "FeatureCallout"
  | "CodeSnippet"
  | "ScreenRecording"
  | "BenchmarkChart"
  | "ComparisonSplit"
  | "CallToAction";

export interface SceneComponentProps {
  format: VideoFormat;
  [key: string]: unknown;
}

export const sceneRegistry: Record<SceneName, ComponentType<any>> = {
  TitleCard,
  FeatureCallout,
  CodeSnippet,
  ScreenRecording,
  BenchmarkChart,
  ComparisonSplit,
  CallToAction,
};

/**
 * Look up a scene component by name.
 * The agent writes scene entries like `{ component: "TitleCard", props: {...} }`
 * and this registry resolves them at render time.
 */
export function getScene(name: string): ComponentType<any> | null {
  return (sceneRegistry as Record<string, ComponentType<any>>)[name] ?? null;
}
