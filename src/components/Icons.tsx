import type { JSX } from "@solidjs/web";

export interface IconProps {
  size?: number;
  class?: string;
}

interface SvgProps extends IconProps {
  strokeWidth?: number;
  children?: JSX.Element;
}

function Svg(props: SvgProps) {
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </Svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--surface, #111)" />
      <circle cx="15" cy="12" r="2" fill="var(--surface, #111)" />
      <circle cx="7" cy="17" r="2" fill="var(--surface, #111)" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.42 1.42" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </Svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      <path d="M5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8L2.5 5.5l1.8-.7z" />
    </Svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M16 18l6-6-6-6" />
      <path d="M8 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconBug(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <rect x="7" y="7" width="10" height="13" rx="5" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
      <path d="M3 13h4" />
      <path d="M17 13h4" />
      <path d="M4 19l3-2" />
      <path d="M20 19l-3-2" />
      <path d="M4 7l3 2" />
      <path d="M20 7l-3 2" />
    </Svg>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Svg>
  );
}

export function IconCpu(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3" />
      <path d="M15 2v3" />
      <path d="M9 19v3" />
      <path d="M15 19v3" />
      <path d="M2 9h3" />
      <path d="M2 15h3" />
      <path d="M19 9h3" />
      <path d="M19 15h3" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </Svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function IconMessage(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function IconZap(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M13 2L3 14h8l-1 8 10-12h-8z" />
    </Svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Svg size={props.size} class={props.class}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </Svg>
  );
}
