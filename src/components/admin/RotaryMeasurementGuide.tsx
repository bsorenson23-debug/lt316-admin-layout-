"use client";

import styles from "./RotaryMeasurementGuide.module.css";

export type RotaryMeasurementFocus =
  | "Rotary Center Position (X)"
  | "Top of Tumbler Position (Y)"
  | "Mount Hole Spacing (X)"
  | "Mount Hole Spacing (Y)"
  | "Rotary Axis Height"
  | "Mount Reference Point";

interface Props {
  activeMeasurement?: RotaryMeasurementFocus | null;
}

function isActive(
  activeMeasurement: RotaryMeasurementFocus | null | undefined,
  key: RotaryMeasurementFocus
): boolean {
  return activeMeasurement === key;
}

export function RotaryMeasurementGuide({ activeMeasurement = null }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.viewBlock}>
        <div className={styles.viewTitle}>Top View</div>
        <svg viewBox="0 0 360 180" className={styles.diagram} aria-label="Rotary measurement guide top view">
          <defs>
            <marker id="arrow-top" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" className={styles.arrowHead} />
            </marker>
          </defs>

          <rect x="18" y="18" width="324" height="144" className={styles.bed} />
          <rect x="112" y="50" width="156" height="88" className={styles.footprint} />

          <line x1="190" y1="24" x2="190" y2="156" className={styles.axis} />
          <circle cx="190" cy="94" r="4" className={styles.axisDot} />

          <circle cx="136" cy="75" r="4" className={styles.hole} />
          <circle cx="244" cy="75" r="4" className={styles.hole} />
          <circle cx="136" cy="113" r="4" className={styles.hole} />
          <circle cx="244" cy="113" r="4" className={styles.hole} />

          <line
            x1="24"
            y1="34"
            x2="190"
            y2="34"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Rotary Center Position (X)") ? styles.measureActive : ""
            }`}
            markerStart="url(#arrow-top)"
            markerEnd="url(#arrow-top)"
          />
          <text
            x="107"
            y="29"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Rotary Center Position (X)") ? styles.labelActive : ""
            }`}
          >
            Rotary Center Position (X)
          </text>

          <line
            x1="136"
            y1="129"
            x2="244"
            y2="129"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Mount Hole Spacing (X)") ? styles.measureActive : ""
            }`}
            markerStart="url(#arrow-top)"
            markerEnd="url(#arrow-top)"
          />
          <text
            x="190"
            y="145"
            textAnchor="middle"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Mount Hole Spacing (X)") ? styles.labelActive : ""
            }`}
          >
            Mount Hole Spacing (X)
          </text>

          <line
            x1="258"
            y1="75"
            x2="258"
            y2="113"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Mount Hole Spacing (Y)") ? styles.measureActive : ""
            }`}
            markerStart="url(#arrow-top)"
            markerEnd="url(#arrow-top)"
          />
          <text
            x="266"
            y="95"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Mount Hole Spacing (Y)") ? styles.labelActive : ""
            }`}
          >
            Mount Hole Spacing (Y)
          </text>

          <circle
            cx="42"
            cy="138"
            r="5"
            className={`${styles.referenceDot} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.referenceActive : ""
            }`}
          />
          <line
            x1="48"
            y1="138"
            x2="112"
            y2="138"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.measureActive : ""
            }`}
            markerEnd="url(#arrow-top)"
          />
          <text
            x="44"
            y="154"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.labelActive : ""
            }`}
          >
            Mount Reference Point
          </text>
        </svg>
      </div>

      <div className={styles.viewBlock}>
        <div className={styles.viewTitle}>Side View</div>
        <svg viewBox="0 0 360 180" className={styles.diagram} aria-label="Rotary measurement guide side view">
          <defs>
            <marker id="arrow-side" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" className={styles.arrowHead} />
            </marker>
          </defs>

          <line x1="18" y1="140" x2="342" y2="140" className={styles.bedDeck} />
          <rect x="74" y="94" width="94" height="46" className={styles.rotaryBody} />
          <line x1="121" y1="90" x2="121" y2="142" className={styles.axis} />
          <circle cx="121" cy="117" r="4" className={styles.axisDot} />

          <rect x="184" y="68" width="96" height="72" rx="6" className={styles.tumbler} />
          <line x1="184" y1="68" x2="280" y2="68" className={styles.topLine} />

          <line
            x1="62"
            y1="140"
            x2="62"
            y2="117"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Rotary Axis Height") ? styles.measureActive : ""
            }`}
            markerStart="url(#arrow-side)"
            markerEnd="url(#arrow-side)"
          />
          <text
            x="70"
            y="125"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Rotary Axis Height") ? styles.labelActive : ""
            }`}
          >
            Rotary Axis Height
          </text>

          <line
            x1="298"
            y1="140"
            x2="298"
            y2="68"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Top of Tumbler Position (Y)") ? styles.measureActive : ""
            }`}
            markerStart="url(#arrow-side)"
            markerEnd="url(#arrow-side)"
          />
          <text
            x="306"
            y="104"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Top of Tumbler Position (Y)") ? styles.labelActive : ""
            }`}
          >
            Top of Tumbler Position (Y)
          </text>

          <circle
            cx="40"
            cy="140"
            r="5"
            className={`${styles.referenceDot} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.referenceActive : ""
            }`}
          />
          <line
            x1="46"
            y1="140"
            x2="74"
            y2="140"
            className={`${styles.measureLine} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.measureActive : ""
            }`}
            markerEnd="url(#arrow-side)"
          />
          <text
            x="18"
            y="156"
            className={`${styles.label} ${
              isActive(activeMeasurement, "Mount Reference Point") ? styles.labelActive : ""
            }`}
          >
            Mount Reference Point
          </text>
        </svg>
      </div>
    </div>
  );
}
