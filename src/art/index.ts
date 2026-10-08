/**
 * The art system, ported from the art sandbox (Luminous Quant Instrument, iteration 03).
 * Visual only: everything here reads model state and never changes it.
 */
import './art.css';

export { configureRenderer, PostProcessing, BLOOM } from './post';
export { WorldArt, type LightingPreset } from './world';
export { art, ART_SCALE, GLOW } from './palette';
export { QualityGovernor, QUALITY_LEVELS, type QualityLevel } from './quality';
