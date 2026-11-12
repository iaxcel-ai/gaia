// The Gaia mark: a leaf with a health cross, on a light tile so it shows on any background.
// It is drawn inline as SVG, so there is no image file to download.
export default function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Gaia logo">
      <rect width="32" height="32" rx="8" fill="#f7faf6" />
      <path d="M16 4.5C24 8 26 17.5 16 27.5C6 17.5 8 8 16 4.5Z" fill="#246b4b" />
      <path d="M14.5 11h3v3.5H21v3h-3.5V21h-3v-3.5H11v-3h3.5Z" fill="#f7faf6" />
    </svg>
  );
}
