/**
 * Re-export the canonical types from the Electron side.
 * This file exists only so renderer code can keep importing from "../lib/types.js".
 *
 * Single source of truth: electron/types.ts.
 */
export {
  DEFAULT_CONFIG,
  VOICE_OPTIONS,
  FORMAT_OPTIONS,
  VIDEO_TYPES,
  MODEL_OPTIONS,
  findModel,
} from "../../electron/types.js";

export type {
  AgentEvent,
  AppConfig,
  GenerateRequest,
  ModelOption,
  ProjectInfo,
  StudioBridge,
  VideoFormat,
  VideoType,
  VideoTypeOption,
} from "../../electron/types.js";

/** Back-compat alias — old routes import this name. */
export type { ProjectInfo as ProductInfo } from "../../electron/types.js";
