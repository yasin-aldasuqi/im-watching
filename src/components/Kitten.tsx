type KittenProps = {
  className?: string;
};

const FUR = "#F28C38";
const FUR_DARK = "#D2691E";
const CREAM = "#FFE8C7";
const PINK = "#F4A3A8";
const EYE = "#9CCB4A";
const INK = "#3B2A20";

/**
 * The app mascot: a small orange Siberian kitten, drawn as inline SVG.
 * Blinking and tail swaying are pure CSS (see globals.css), so this stays
 * a Server Component and ships no JavaScript to the browser.
 */
export default function Kitten({ className }: KittenProps) {
  return (
    <svg
      viewBox="0 0 200 220"
      role="img"
      aria-label="A small orange Siberian kitten watching you"
      className={className}
    >
      {/* Fluffy tail, behind the body */}
      <g className="kitten-tail">
        <path
          d="M140 196 C178 196 196 168 186 136 C180 118 164 116 162 130 C172 136 174 160 156 172 C148 178 140 180 132 180 Z"
          fill={FUR}
        />
        <path d="M184 132 C180 120 168 118 164 128 C172 128 180 132 184 140 Z" fill={CREAM} />
      </g>

      {/* Body */}
      <ellipse cx="100" cy="162" rx="54" ry="50" fill={FUR} />

      {/* Siberian chest ruff */}
      <path
        d="M66 128 L74 140 L70 152 L82 158 L80 172 L92 170 L100 182 L108 170 L120 172 L118 158 L130 152 L126 140 L134 128 Q100 146 66 128 Z"
        fill={CREAM}
      />

      {/* Front paws */}
      <ellipse cx="80" cy="206" rx="15" ry="9" fill={CREAM} />
      <ellipse cx="120" cy="206" rx="15" ry="9" fill={CREAM} />

      {/* Ears with lynx-like tufts */}
      <path d="M52 76 L58 20 L94 50 Z" fill={FUR} />
      <path d="M148 76 L142 20 L106 50 Z" fill={FUR} />
      <path d="M60 64 L62 34 L82 52 Z" fill={PINK} />
      <path d="M140 64 L138 34 L118 52 Z" fill={PINK} />
      <path d="M55 30 Q54 16 57 8 Q61 18 64 28 Z" fill={FUR_DARK} />
      <path d="M145 30 Q146 16 143 8 Q139 18 136 28 Z" fill={FUR_DARK} />

      {/* Head with fluffy cheeks */}
      <ellipse cx="100" cy="90" rx="54" ry="46" fill={FUR} />
      <path d="M48 96 L36 104 L50 108 L40 118 L58 116 Z" fill={FUR} />
      <path d="M152 96 L164 104 L150 108 L160 118 L142 116 Z" fill={FUR} />

      {/* Forehead stripes */}
      <path
        d="M100 48 L100 62 M88 50 L91 62 M112 50 L109 62"
        stroke={FUR_DARK}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Muzzle */}
      <ellipse cx="100" cy="114" rx="20" ry="13" fill={CREAM} />

      {/* Eyes (blink together) */}
      <g className="kitten-eyes">
        <ellipse cx="78" cy="92" rx="12" ry="13" fill={EYE} />
        <ellipse cx="122" cy="92" rx="12" ry="13" fill={EYE} />
        <ellipse cx="78" cy="93" rx="4.5" ry="9" fill={INK} />
        <ellipse cx="122" cy="93" rx="4.5" ry="9" fill={INK} />
        <circle cx="82" cy="87" r="3" fill="#fff" />
        <circle cx="126" cy="87" r="3" fill="#fff" />
      </g>

      {/* Nose and mouth */}
      <path d="M94 106 L106 106 L100 113 Z" fill={PINK} />
      <path
        d="M100 113 Q100 120 93 121 M100 113 Q100 120 107 121"
        stroke={INK}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Whiskers */}
      <path
        d="M80 112 L50 106 M80 117 L48 120 M120 112 L150 106 M120 117 L152 120"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
