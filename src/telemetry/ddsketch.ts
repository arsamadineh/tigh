/**
 * DDSketch: A bounded, relative-error sketch for streaming quantile estimation (P50–P99)
 * without unbounded memory growth.
 *
 * Uses logarithmic bucketing with a configurable maximum relative error (gamma).
 * Memory is strictly bounded by a fixed bucket array covering a defined dynamic range.
 * Percentiles are smoothly interpolated within the target bucket.
 */
export class DDSketch {
  private readonly gamma: number;
  private readonly alpha: number;
  private readonly numBuckets: number;
  private readonly offset: number;

  private readonly counts: Int32Array;
  private totalCount = 0;
  private sum = 0;
  private minValue = Infinity;
  private maxValue = -Infinity;

  // Dynamic range [minTrack, maxTrack]. Values outside are clamped to edge buckets.
  private readonly minTrack: number;
  private readonly maxTrack: number;

  constructor(options?: { gamma?: number; minTrack?: number; maxTrack?: number }) {
    const gamma = options?.gamma ?? 0.01; // 1% relative error guarantee
    this.gamma = gamma;
    this.alpha = (2 * gamma) / (1 - gamma);
    this.minTrack = options?.minTrack ?? 0.001; // 1 microsecond
    this.maxTrack = options?.maxTrack ?? 100000; // 100 seconds
    const logRange = Math.log(this.maxTrack / this.minTrack);
    const logBase = Math.log1p(this.alpha);
    this.numBuckets = Math.ceil(logRange / logBase) + 2;
    this.offset = 0;
    this.counts = new Int32Array(this.numBuckets);
  }

  private bucketIndex(value: number): number {
    if (value <= 0) return 0;
    const v = Math.min(Math.max(value, this.minTrack), this.maxTrack);
    const idx = Math.floor(Math.log(v / this.minTrack) / Math.log1p(this.alpha));
    return Math.max(0, Math.min(this.numBuckets - 1, idx + this.offset));
  }

  /**
   * Observes a latency value in milliseconds.
   */
  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    const idx = this.bucketIndex(value);
    this.counts[idx]++;
    this.totalCount++;
    this.sum += value;
    if (value < this.minValue) this.minValue = value;
    if (value > this.maxValue) this.maxValue = value;
  }

  private bucketValue(idx: number): number {
    return this.minTrack * Math.pow(1 + this.alpha, idx - this.offset);
  }

  /**
   * Returns the p-th percentile (0-100) of observed values, or 0 if none.
   * Uses linear interpolation within the target bucket for high precision.
   */
  percentile(p: number): number {
    if (this.totalCount === 0) return 0;
    if (p <= 0) return this.minValue === Infinity ? 0 : this.minValue;
    if (p >= 100) return this.maxValue === -Infinity ? 0 : this.maxValue;

    const target = (p / 100) * this.totalCount;
    let cum = 0;
    for (let i = 0; i < this.numBuckets; i++) {
      const c = this.counts[i]!;
      if (c === 0) continue;
      if (cum + c >= target) {
        const lo = this.bucketValue(i);
        const hi = i + 1 < this.numBuckets ? this.bucketValue(i + 1) : lo * (1 + this.alpha);
        const frac = (target - cum) / c;
        return lo + (hi - lo) * frac;
      }
      cum += c;
    }
    return this.maxValue === -Infinity ? 0 : this.maxValue;
  }

  p50(): number {
    return this.percentile(50);
  }

  p90(): number {
    return this.percentile(90);
  }

  p95(): number {
    return this.percentile(95);
  }

  p99(): number {
    return this.percentile(99);
  }

  get count(): number {
    return this.totalCount;
  }

  get avg(): number {
    return this.totalCount > 0 ? this.sum / this.totalCount : 0;
  }

  get min(): number {
    return this.minValue === Infinity ? 0 : this.minValue;
  }

  get max(): number {
    return this.maxValue === -Infinity ? 0 : this.maxValue;
  }

  reset(): void {
    for (let i = 0; i < this.numBuckets; i++) this.counts[i] = 0;
    this.totalCount = 0;
    this.sum = 0;
    this.minValue = Infinity;
    this.maxValue = -Infinity;
  }
}

/**
 * High-precision latency histogram using bounded DDSketch.
 */
export class LatencyHistogram {
  private readonly sketch: DDSketch;

  constructor(options?: { gamma?: number }) {
    this.sketch = new DDSketch(options);
  }

  observe(value: number): void {
    this.sketch.add(value);
  }

  get p50(): number {
    return this.sketch.p50();
  }
  get p90(): number {
    return this.sketch.p90();
  }
  get p95(): number {
    return this.sketch.p95();
  }
  get p99(): number {
    return this.sketch.p99();
  }
  get avg(): number {
    return this.sketch.avg;
  }
  get count(): number {
    return this.sketch.count;
  }
  get min(): number {
    return this.sketch.min;
  }
  get max(): number {
    return this.sketch.max;
  }

  reset(): void {
    this.sketch.reset();
  }
}
