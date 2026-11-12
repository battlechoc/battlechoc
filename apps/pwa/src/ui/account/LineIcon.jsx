// The account dialogs' small line icons (the owner's mockup B, 2026-11-12): inline stroke SVGs in
// the text's colour (currentColor) and size (em), so they follow the type scale.

const PATHS = {
  // a sheet with lines: the recovery words
  words: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  passkey: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.9 12.1 20 3" />
      <path d="M16 7l3 3" />
      <path d="M14 9l2 2" />
    </>
  ),
  wallet: (
    <>
      <path d="M6 6V5a2 2 0 0 1 2-2h10" />
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M16 13h2" />
    </>
  ),
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </>
  ),
  // a sheet with a padlock: the encrypted backup file
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <rect x="9" y="14" width="6" height="5" rx="1" />
      <path d="M10.5 14v-1.5a1.5 1.5 0 0 1 3 0V14" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />,
  warning: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  next: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
};

/** One icon by `name`; `size` in em (1: the text's size), `width` the stroke. */
const LineIcon = ({ name, size = 1, width = 2, className, style }) => (
  <svg
    aria-hidden="true"
    className={className}
    style={{ flex: "none", ...style }}
    width={`${size}em`}
    height={`${size}em`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {PATHS[name]}
  </svg>
);

export default LineIcon;
