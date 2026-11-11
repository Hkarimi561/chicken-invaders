// Gyroscope steering: converts device tilt into a target position on the playfield (the same "move toward
// this point" input the mouse uses). Pure functions, so they can be tested without a device.
import { W, H } from '../shared/sim.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * deviceorientation gives beta (front/back tilt) and gamma (left/right tilt) relative to the phone's own
 * axes. Rotate them into screen axes: x = screen right, y = screen down, for the current screen angle.
 */
export function screenTilt(beta, gamma, angle) {
  switch (((Math.round(angle) % 360) + 360) % 360) {
    case 90: return { x: beta, y: -gamma };
    case 270: return { x: -beta, y: gamma };
    case 180: return { x: -gamma, y: -beta };
    default: return { x: gamma, y: beta };
  }
}

export const GYRO = { rangeX: 24, rangeY: 18, dead: 1.5 }; // degrees of tilt for full travel / ignored wobble

/** Tilt away from the calibrated neutral pose -> target point inside the ship's allowed area. */
export function tiltToTarget(tilt, neutral, opts = GYRO) {
  const dz = (v) => (Math.abs(v) < opts.dead ? 0 : v - Math.sign(v) * opts.dead);
  const nx = clamp(dz(tilt.x - neutral.x) / opts.rangeX, -1, 1);
  const ny = clamp(dz(tilt.y - neutral.y) / opts.rangeY, -1, 1);
  const top = H * 0.45, bottom = H - 30; // the ship's vertical limits in the sim
  return {
    tx: W / 2 + nx * (W / 2 - 24),
    ty: (top + bottom) / 2 + ny * ((bottom - top) / 2),
  };
}

/** Browsers only expose motion sensors on secure (HTTPS or localhost) pages. */
export function gyroSupport() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return typeof window.DeviceOrientationEvent.requestPermission === 'function' ? 'needs-permission' : 'ready';
}
