/** WCAG 2.x relative luminance and contrast ratio for #rrggbb colours. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Scheme = Record<string, string>;

function colourTokens(block: string): Scheme {
  const tokens: Scheme = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

/**
 * Reads light and dark colour tokens from tokens.css: light is the first
 * top-level :root block, dark is the :root inside
 * @media (prefers-color-scheme: dark). Dark inherits any token it does not set.
 */
export function parseSchemes(css: string): { light: Scheme; dark: Scheme } {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkStart = withoutComments.search(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  if (darkStart < 0) throw new Error("No dark scheme media query found");
  const lightPart = withoutComments.slice(0, darkStart);
  const darkPart = withoutComments.slice(darkStart);
  const light = colourTokens(lightPart);
  const dark = { ...light, ...colourTokens(darkPart) };
  return { light, dark };
}
