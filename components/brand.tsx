import Link from "next/link";

const DOLLAR_PATH =
  "M15.25 8.9c0-1.45-1.45-2.4-3.25-2.4s-3.25.9-3.25 2.35c0 1.6 1.5 2.15 3.25 2.6 1.85.45 3.25 1.1 3.25 2.8 0 1.55-1.45 2.5-3.25 2.5s-3.25-.95-3.25-2.4M12 4.75v14.5";

/** The mark: a dollar sign on a rounded tile, the cost of the space you hold. */
export function BrandMark({ size = 26, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6.5" className={inverse ? "fill-emerald-300" : "fill-emerald-800"} />
      <path d={DOLLAR_PATH} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={inverse ? "stroke-night" : "stroke-white"} />
    </svg>
  );
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-display text-2xl leading-none ${inverse ? "text-white" : "text-ink"}`}>
      <BrandMark inverse={inverse} />
      Lease Consolidation Engine
    </Link>
  );
}
