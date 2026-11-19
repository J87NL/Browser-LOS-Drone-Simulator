// Fixed-timestep accumulator: physics runs at a fixed rate no matter how fast
// or slow frames are rendered.

export class FixedStepper {
  /**
   * @param {number} hz physics rate
   * @param {number} maxFrameDt clamp on a single frame's dt (seconds)
   */
  constructor(hz, maxFrameDt = 0.1) {
    this.dt = 1 / hz;
    this.maxFrameDt = maxFrameDt;
    this.accumulator = 0;
    this.time = 0;
  }

  /**
   * Feed one frame's elapsed time and run as many fixed steps as fit.
   * @param {number} frameDt seconds since the last frame
   * @param {(dt:number)=>void} step called once per fixed step
   * @returns {{steps:number, alpha:number}} alpha is the leftover fraction for render interpolation
   */
  advance(frameDt, step) {
    if (!(frameDt > 0)) return { steps: 0, alpha: this.accumulator / this.dt };
    this.accumulator += Math.min(frameDt, this.maxFrameDt);
    let steps = 0;
    // Small epsilon so float error does not drop a step at exact multiples.
    while (this.accumulator >= this.dt - 1e-9) {
      step(this.dt);
      this.accumulator -= this.dt;
      this.time += this.dt;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return { steps, alpha: this.accumulator / this.dt };
  }

  reset() {
    this.accumulator = 0;
  }
}
