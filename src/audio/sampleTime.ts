/** Nearest sample with a sub-nanosecond bias against floating-point floor drift. */
export const sampleTime = (time: number, rate: number): number => (Math.round(time * rate + 1e-6) + 1e-6) / rate;

