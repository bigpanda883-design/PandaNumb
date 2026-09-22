/**
 * Skeleton primitives
 * -------------------
 * One shimmer engine, reused everywhere. Pages compose these small blocks
 * instead of each hand-rolling its own loading markup, so there is a single
 * place that owns the animation, the light/dark colours and responsiveness.
 *
 * Nothing here changes the real UI — these render only while `loading` is true
 * and every page falls back to its normal content the moment data arrives.
 */
import "./Skeleton.css";

/** A single shimmering block. `w`/`h` accept any CSS length ("100%", "2rem"). */
export function Skeleton({
  width = "100%",
  height = "1rem",
  radius = "8px",
  circle = false,
  className = "",
  style,
}) {
  return (
    <span
      className={`sk-block ${circle ? "sk-circle" : ""} ${className}`}
      aria-hidden="true"
      style={{
        width,
        height: circle ? width : height,
        borderRadius: circle ? "50%" : radius,
        ...style,
      }}
    />
  );
}

/** A single line of placeholder text. `size` tweaks height to match a font. */
export function SkeletonText({
  width = "100%",
  lines = 1,
  size = "14px",
  className = "",
  style,
}) {
  const lineStyle = { height: size, borderRadius: "6px" };

  if (lines === 1) {
    return (
      <Skeleton
        width={width}
        style={{ ...lineStyle, ...style }}
        className={className}
      />
    );
  }

  return (
    <span className={`sk-text-group ${className}`} style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          // The last line is short so a paragraph reads as ragged, not a box.
          width={index === lines - 1 ? "62%" : "100%"}
          style={lineStyle}
        />
      ))}
    </span>
  );
}

/**
 * Wraps any set of children in the shimmer treatment. Use it when a whole
 * custom shape needs to pulse together rather than block by block.
 */
export function SkeletonGroup({ children, className = "" }) {
  return <span className={`sk-group ${className}`}>{children}</span>;
}

/** Convenience: repeat a render function `count` times. */
export function SkeletonRepeat({ count = 3, children }) {
  return Array.from({ length: count }).map((_, index) => (
    <span key={index} style={{ display: "contents" }}>
      {children(index)}
    </span>
  ));
}
