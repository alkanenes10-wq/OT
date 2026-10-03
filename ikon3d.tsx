"use client";
// Yumuşak 3D görünümlü ikonlar (kodla çizilir; resim dosyası yok, her ekranda net).
// Her ikon: zemin gölgesi + alt "kalınlık" katmanı + geçişli gövde + üstte parlama.

import { useId, type ReactNode } from "react";

export type Icon3DName =
  | "calendar"
  | "book"
  | "chart"
  | "check"
  | "clock"
  | "journal"
  | "note"
  | "question"
  | "users"
  | "video"
  | "alert"
  | "list"
  | "target"
  | "info";

type Pal = { hi: string; lo: string; edge: string };
const TEAL: Pal = { hi: "#3fd0bd", lo: "#0e8a7c", edge: "#0a5f56" };
const BLUE: Pal = { hi: "#6aa9f4", lo: "#2f6fd0", edge: "#1f4f9c" };
const ORANGE: Pal = { hi: "#ffb169", lo: "#f07d2e", edge: "#b9571a" };
const PURPLE: Pal = { hi: "#b59cf7", lo: "#7a5ae0", edge: "#553bab" };
const GREEN: Pal = { hi: "#62d99a", lo: "#1fa765", edge: "#157646" };
const AMBER: Pal = { hi: "#ffd76a", lo: "#f5a524", edge: "#b87410" };
const RED: Pal = { hi: "#ff8f85", lo: "#e5483d", edge: "#a82d25" };
const PAPER: Pal = { hi: "#ffffff", lo: "#e6ecf3", edge: "#b9c4d2" };

function Defs({ id, pals }: { id: string; pals: Record<string, Pal> }) {
  return (
    <defs>
      {Object.entries(pals).map(([k, p]) => (
        <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.hi} />
          <stop offset="1" stopColor={p.lo} />
        </linearGradient>
      ))}
      <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#0b1b2b" stopOpacity="0.28" />
        <stop offset="1" stopColor="#0b1b2b" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

const Ground = ({ id, w = 40 }: { id: string; w?: number }) => <ellipse cx="32" cy="57.5" rx={w / 2} ry="4" fill={`url(#${id}-shadow)`} />;

function draw(name: Icon3DName, id: string): { pals: Record<string, Pal>; body: ReactNode } {
  const g = (k: string) => `url(#${id}-${k})`;
  switch (name) {
    case "calendar":
      return {
        pals: { p: PAPER, a: TEAL },
        body: (
          <>
            <Ground id={id} w={44} />
            <rect x="10" y="15" width="44" height="40" rx="9" fill={PAPER.edge} />
            <rect x="10" y="12" width="44" height="40" rx="9" fill={g("p")} />
            <path d="M10 21a9 9 0 0 1 9-9h26a9 9 0 0 1 9 9v5H10z" fill={g("a")} />
            <path d="M12 21a7 7 0 0 1 7-7h26a7 7 0 0 1 7 7v1H12z" fill={`url(#${id}-gloss)`} />
            <rect x="19" y="7" width="5" height="11" rx="2.5" fill="#dfe6ee" stroke={PAPER.edge} strokeWidth="1" />
            <rect x="40" y="7" width="5" height="11" rx="2.5" fill="#dfe6ee" stroke={PAPER.edge} strokeWidth="1" />
            {[0, 1, 2, 3].map((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={16 + c * 8.7} y={31 + r * 8.5} width="5.6" height="5.6" rx="1.8" fill={c === 2 && r === 0 ? TEAL.lo : "#cdd6e1"} />))}
          </>
        ),
      };
    case "book":
      return {
        pals: { a: BLUE, p: PAPER },
        body: (
          <>
            <Ground id={id} w={40} />
            <rect x="14" y="12" width="37" height="44" rx="6" fill={BLUE.edge} />
            <rect x="17" y="46" width="33" height="7" rx="2" fill={g("p")} />
            <path d="M18 48.5h31M18 50.8h31" stroke="#c3ccd8" strokeWidth="0.8" />
            <rect x="14" y="8" width="37" height="42" rx="6" fill={g("a")} />
            <rect x="14" y="8" width="7" height="42" rx="3.5" fill="#1f4f9c" opacity="0.35" />
            <rect x="16" y="10" width="33" height="14" rx="5" fill={`url(#${id}-gloss)`} opacity="0.7" />
            <rect x="26" y="18" width="19" height="10" rx="3" fill="#fff" opacity="0.92" />
            <path d="M29 21.5h13M29 24.5h8" stroke={BLUE.lo} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M40 50v8l3-2.4 3 2.4v-8z" fill={ORANGE.lo} />
          </>
        ),
      };
    case "chart":
      return {
        pals: { a: TEAL, b: BLUE, c: ORANGE, p: PAPER },
        body: (
          <>
            <Ground id={id} w={46} />
            <rect x="8" y="48" width="48" height="8" rx="4" fill={PAPER.edge} />
            <rect x="8" y="45" width="48" height="8" rx="4" fill={g("p")} />
            {(
              [
                [14, 30, "b", BLUE],
                [27, 20, "a", TEAL],
                [40, 10, "c", ORANGE],
              ] as [number, number, string, Pal][]
            ).map(([x, y, k, p]) => (
              <g key={k}>
                <rect x={x + 2} y={y + 1} width="10" height={47 - y} rx="3.5" fill={p.edge} />
                <rect x={x} y={y} width="10" height={47 - y} rx="3.5" fill={g(k)} />
                <rect x={x + 1.5} y={y + 1.5} width="3" height={Math.max(4, (47 - y) * 0.6)} rx="1.5" fill="#fff" opacity="0.35" />
              </g>
            ))}
          </>
        ),
      };
    case "check":
      return {
        pals: { a: GREEN },
        body: (
          <>
            <Ground id={id} w={38} />
            <circle cx="32" cy="33" r="22" fill={GREEN.edge} />
            <circle cx="32" cy="30" r="22" fill={g("a")} />
            <ellipse cx="32" cy="19" rx="15" ry="8" fill={`url(#${id}-gloss)`} />
            <path d="M21.5 31.5l7 7L43 24" fill="none" stroke={GREEN.edge} strokeOpacity="0.35" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.6)" />
            <path d="M21.5 31.5l7 7L43 24" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ),
      };
    case "clock":
      return {
        pals: { a: TEAL, p: PAPER },
        body: (
          <>
            <Ground id={id} w={38} />
            <circle cx="32" cy="33" r="22" fill={TEAL.edge} />
            <circle cx="32" cy="30" r="22" fill={g("a")} />
            <circle cx="32" cy="30" r="16.5" fill={g("p")} />
            <ellipse cx="32" cy="21" rx="12" ry="6" fill="#fff" opacity="0.7" />
            {[0, 90, 180, 270].map((a) => (
              <rect key={a} x="31" y="16" width="2" height="4" rx="1" fill="#9aa7b8" transform={`rotate(${a} 32 30)`} />
            ))}
            <path d="M32 30V21.5M32 30l7 4" stroke="#22364a" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="32" cy="30" r="2.4" fill={ORANGE.lo} />
          </>
        ),
      };
    case "journal":
      return {
        pals: { a: ORANGE, p: PAPER },
        body: (
          <>
            <Ground id={id} w={40} />
            <rect x="15" y="11" width="36" height="46" rx="6" fill={ORANGE.edge} />
            <rect x="15" y="8" width="36" height="46" rx="6" fill={g("a")} />
            <rect x="21" y="13" width="26" height="36" rx="3.5" fill={g("p")} />
            <path d="M26 21h16M26 27h16M26 33h11" stroke="#b9c4d2" strokeWidth="2" strokeLinecap="round" />
            <path d="M26 40.5l2.6 2.6 5-5.4" fill="none" stroke={GREEN.lo} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            {[16, 25, 34, 43].map((y) => (
              <rect key={y} x="11" y={y} width="9" height="4" rx="2" fill="#dfe6ee" stroke="#9aa7b8" strokeWidth="0.8" />
            ))}
            <rect x="17" y="10" width="32" height="8" rx="4" fill={`url(#${id}-gloss)`} opacity="0.5" />
          </>
        ),
      };
    case "note":
      return {
        pals: { a: AMBER },
        body: (
          <>
            <Ground id={id} w={40} />
            <path d="M13 17a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v24L39 55H19a6 6 0 0 1-6-6z" fill={AMBER.edge} />
            <path d="M13 14a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v24L39 52H19a6 6 0 0 1-6-6z" fill={g("a")} />
            <path d="M51 38H44a5 5 0 0 0-5 5v9z" fill="#fff3c4" />
            <path d="M51 38H44a5 5 0 0 0-5 5v9z" fill={AMBER.edge} opacity="0.18" />
            <rect x="15" y="10" width="34" height="10" rx="5" fill={`url(#${id}-gloss)`} />
            <path d="M21 22h22M21 29h22M21 36h13" stroke={AMBER.edge} strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
          </>
        ),
      };
    case "question":
      return {
        pals: { a: PURPLE },
        body: (
          <>
            <Ground id={id} w={38} />
            <path d="M12 21a9 9 0 0 1 9-9h22a9 9 0 0 1 9 9v17a9 9 0 0 1-9 9H31l-9 8v-8h-1a9 9 0 0 1-9-9z" fill={PURPLE.edge} />
            <path d="M12 18a9 9 0 0 1 9-9h22a9 9 0 0 1 9 9v17a9 9 0 0 1-9 9H31l-9 8v-8h-1a9 9 0 0 1-9-9z" fill={g("a")} />
            <rect x="15" y="11" width="34" height="12" rx="6" fill={`url(#${id}-gloss)`} />
            <path d="M27 22.5a5.2 5.2 0 1 1 7.6 4.6c-1.6.9-2.6 1.8-2.6 3.7" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
            <circle cx="32" cy="37.2" r="2.3" fill="#fff" />
          </>
        ),
      };
    case "users":
      return {
        pals: { a: TEAL, b: BLUE },
        body: (
          <>
            <Ground id={id} w={46} />
            <circle cx="42" cy="21" r="8" fill={BLUE.edge} />
            <circle cx="42" cy="19.5" r="8" fill={g("b")} />
            <path d="M28 52c0-9 6-15 14-15s14 6 14 15v2H28z" fill={BLUE.edge} />
            <path d="M28 50c0-9 6-15 14-15s14 6 14 15v2H28z" fill={g("b")} />
            <circle cx="24" cy="23" r="10" fill={TEAL.edge} />
            <circle cx="24" cy="21" r="10" fill={g("a")} />
            <ellipse cx="22" cy="16.5" rx="5.5" ry="3.2" fill="#fff" opacity="0.4" />
            <path d="M7 53c0-10.5 7.5-17 17-17s17 6.500 17 17v2H7z" fill={TEAL.edge} />
            <path d="M7 51c0-10.5 7.5-17 17-17s17 6.500 17 17v2H7z" fill={g("a")} />
            <path d="M13 44c2-4.500 6-7 11-7s9 2.500 11 7" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.4" strokeLinecap="round" />
          </>
        ),
      };
    case "video":
      return {
        pals: { a: RED },
        body: (
          <>
            <Ground id={id} w={46} />
            <rect x="7" y="17" width="50" height="36" rx="10" fill={RED.edge} />
            <rect x="7" y="14" width="50" height="36" rx="10" fill={g("a")} />
            <rect x="10" y="16" width="44" height="13" rx="7" fill={`url(#${id}-gloss)`} />
            <path d="M27.500 25.200a1.800 1.800 0 0 1 2.700-1.560l11 6.800a1.800 1.800 0 0 1 0 3.120l-11 6.800a1.800 1.800 0 0 1-2.700-1.560z" fill={RED.edge} opacity="0.35" transform="translate(0 1.500)" />
            <path d="M27.500 25.200a1.800 1.800 0 0 1 2.700-1.560l11 6.800a1.800 1.800 0 0 1 0 3.120l-11 6.800a1.800 1.800 0 0 1-2.700-1.560z" fill="#fff" />
          </>
        ),
      };
    case "alert":
      return {
        pals: { a: AMBER },
        body: (
          <>
            <Ground id={id} w={44} />
            <path d="M27.200 12.500a5.500 5.500 0 0 1 9.600 0l18 31.500a5.500 5.500 0 0 1-4.800 8.200H14a5.500 5.500 0 0 1-4.800-8.200z" fill={AMBER.edge} transform="translate(0 3)" />
            <path d="M27.200 12.500a5.500 5.500 0 0 1 9.600 0l18 31.500a5.500 5.500 0 0 1-4.800 8.200H14a5.500 5.500 0 0 1-4.800-8.200z" fill={g("a")} />
            <path d="M29 15.500a3.500 3.500 0 0 1 6 0l5 8.800H24z" fill="#fff" opacity="0.35" />
            <rect x="29.600" y="24" width="4.800" height="15" rx="2.400" fill="#5b3a06" />
            <circle cx="32" cy="45" r="2.800" fill="#5b3a06" />
          </>
        ),
      };
    case "list":
      return {
        pals: { a: BLUE, p: PAPER },
        body: (
          <>
            <Ground id={id} w={40} />
            <rect x="13" y="13" width="38" height="44" rx="7" fill={BLUE.edge} />
            <rect x="13" y="10" width="38" height="44" rx="7" fill={g("a")} />
            <rect x="17.500" y="15" width="29" height="35" rx="4" fill={g("p")} />
            <rect x="24" y="6" width="16" height="9" rx="4.500" fill="#dfe6ee" stroke="#9aa7b8" strokeWidth="1" />
            {[23, 32, 41].map((y, i) => (
              <g key={y}>
                <rect x="21.500" y={y} width="6" height="6" rx="2" fill={i < 2 ? GREEN.lo : "#cdd6e1"} />
                {i < 2 && <path d={`M23 ${y + 3.100}l1.300 1.300 2.300-2.600`} fill="none" stroke="#fff" strokeWidth="1.300" strokeLinecap="round" strokeLinejoin="round" />}
                <rect x="30.500" y={y + 1.700} width={i === 1 ? 9 : 13} height="2.600" rx="1.300" fill="#b9c4d2" />
              </g>
            ))}
          </>
        ),
      };
    case "target":
      return {
        pals: { a: RED, p: PAPER, c: AMBER },
        body: (
          <>
            <Ground id={id} w={40} />
            <circle cx="30" cy="35" r="22" fill={RED.edge} />
            <circle cx="30" cy="32" r="22" fill={g("a")} />
            <circle cx="30" cy="32" r="15.500" fill={g("p")} />
            <circle cx="30" cy="32" r="9.500" fill={g("a")} />
            <circle cx="30" cy="32" r="4" fill="#fff" />
            <ellipse cx="27" cy="18" rx="12" ry="5" fill="#fff" opacity="0.3" />
            <path d="M30 32L50 12" stroke="#22364a" strokeWidth="2.800" strokeLinecap="round" />
            <path d="M46 8v8h8l5-5h-7V4z" fill={g("c")} stroke={AMBER.edge} strokeWidth="0.800" strokeLinejoin="round" />
          </>
        ),
      };
    default:
      return {
        pals: { a: TEAL },
        body: (
          <>
            <Ground id={id} w={38} />
            <circle cx="32" cy="33" r="22" fill={TEAL.edge} />
            <circle cx="32" cy="30" r="22" fill={g("a")} />
            <ellipse cx="32" cy="19" rx="15" ry="8" fill={`url(#${id}-gloss)`} />
            <circle cx="32" cy="20.500" r="2.800" fill="#fff" />
            <rect x="29.600" y="26" width="4.800" height="15" rx="2.400" fill="#fff" />
          </>
        ),
      };
  }
}

const KNOWN = new Set<string>(["calendar", "book", "chart", "check", "clock", "journal", "note", "question", "users", "video", "alert", "list", "target", "info"]);
export const has3D = (name: string): name is Icon3DName => KNOWN.has(name);

export function Icon3D({ name, size = 56, className }: { name: Icon3DName; size?: number; className?: string }) {
  const id = `i3d-${name}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { pals, body } = draw(name, id);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <Defs id={id} pals={pals} />
      {body}
    </svg>
  );
}
