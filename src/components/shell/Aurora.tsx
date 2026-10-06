import './Aurora.css';

/**
 * The ambient glow behind the glass.
 *
 * Three large, heavily blurred colour blobs drift slowly on long CSS
 * animations with different durations. Because the durations don't share a
 * common factor, the combined pattern takes minutes to repeat, which reads as
 * organic rather than looping.
 *
 * It costs almost nothing: the blobs are composited layers that only change
 * `transform`, which the GPU can animate without re-layout or re-paint.
 */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora__blob aurora__blob--a" />
      <div className="aurora__blob aurora__blob--b" />
      <div className="aurora__blob aurora__blob--c" />
      <div className="aurora__grain" />
    </div>
  );
}
