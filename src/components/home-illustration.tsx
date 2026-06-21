export function HomeIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* background shapes */}
      <circle cx="300" cy="86" r="70" fill="#E7E0F7" />
      <circle cx="372" cy="180" r="26" fill="#F7E4A0" />
      <circle cx="58" cy="244" r="40" fill="#DCEBD0" />
      <circle cx="20" cy="70" r="5" fill="#C9BEA8" />
      <circle cx="406" cy="250" r="6" fill="#E7E0F7" />
      <circle cx="386" cy="58" r="4" fill="#F7E4A0" />

      {/* card 1 — blush cover */}
      <g transform="translate(40 78) rotate(-7)">
        <rect x="0" y="0" width="150" height="170" rx="20" fill="#FFFDF8" stroke="#E6DCCB" strokeWidth="1.5" />
        <rect x="14" y="14" width="122" height="68" rx="12" fill="#F6D3E1" />
        <circle cx="118" cy="68" r="11" fill="#FFFDF8" />
        <rect x="14" y="98" width="92" height="11" rx="5.5" fill="#E0D6C4" />
        <rect x="14" y="118" width="62" height="9" rx="4.5" fill="#ECE5D8" />
        <rect x="14" y="134" width="78" height="9" rx="4.5" fill="#ECE5D8" />
      </g>

      {/* card 2 — coral cover with play */}
      <g transform="translate(200 44) rotate(7)">
        <rect x="0" y="0" width="150" height="170" rx="20" fill="#FFFDF8" stroke="#E6DCCB" strokeWidth="1.5" />
        <rect x="14" y="14" width="122" height="68" rx="12" fill="#F7D7CE" />
        <circle cx="75" cy="48" r="17" fill="#FFFDF8" />
        <path d="M70 40 l13 8 l-13 8 z" fill="#8A3E22" />
        <rect x="14" y="98" width="88" height="11" rx="5.5" fill="#E0D6C4" />
        <rect x="14" y="118" width="64" height="9" rx="4.5" fill="#ECE5D8" />
        <rect x="14" y="134" width="74" height="9" rx="4.5" fill="#ECE5D8" />
      </g>
    </svg>
  );
}
