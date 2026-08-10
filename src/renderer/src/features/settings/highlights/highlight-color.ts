export interface RgbaColor {
  red: number
  green: number
  blue: number
  alpha: number
}

export interface HsvaColor {
  hue: number
  saturation: number
  value: number
  alpha: number
}

const DEFAULT_COLOR = '#f5a524ff'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255))
}

function byteHex(value: number): string {
  return byte(value).toString(16).padStart(2, '0')
}

export function parseHighlightColor(value: string, fallback = DEFAULT_COLOR): RgbaColor {
  const raw = typeof value === 'string' ? value.trim().replace(/^#/, '') : ''
  let expanded = raw
  if (/^[0-9a-f]{3,4}$/i.test(raw)) {
    expanded = [...raw].map((part) => `${part}${part}`).join('')
  }
  if (/^[0-9a-f]{6}$/i.test(expanded)) expanded += 'ff'
  if (!/^[0-9a-f]{8}$/i.test(expanded)) {
    const safeFallback = fallback === value ? DEFAULT_COLOR : fallback
    return parseHighlightColor(safeFallback, DEFAULT_COLOR)
  }
  return {
    red: parseInt(expanded.slice(0, 2), 16),
    green: parseInt(expanded.slice(2, 4), 16),
    blue: parseInt(expanded.slice(4, 6), 16),
    alpha: parseInt(expanded.slice(6, 8), 16)
  }
}

export function rgbaToHex(color: RgbaColor): string {
  return `#${byteHex(color.red)}${byteHex(color.green)}${byteHex(color.blue)}${byteHex(color.alpha)}`
}

export function normalizeHighlightColor(value: string, fallback = DEFAULT_COLOR): string {
  return rgbaToHex(parseHighlightColor(value, fallback))
}

export function rgbaToHsva(color: RgbaColor): HsvaColor {
  const red = byte(color.red) / 255
  const green = byte(color.green) / 255
  const blue = byte(color.blue) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }
  if (hue < 0) hue += 360
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
    alpha: byte(color.alpha) / 255
  }
}

export function hsvaToRgba(color: HsvaColor): RgbaColor {
  const hue = ((Number.isFinite(color.hue) ? color.hue : 0) % 360 + 360) % 360
  const saturation = clamp(color.saturation, 0, 1)
  const value = clamp(color.value, 0, 1)
  const chroma = value * saturation
  const section = hue / 60
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0
  if (section < 1) [red, green] = [chroma, intermediate]
  else if (section < 2) [red, green] = [intermediate, chroma]
  else if (section < 3) [green, blue] = [chroma, intermediate]
  else if (section < 4) [green, blue] = [intermediate, chroma]
  else if (section < 5) [red, blue] = [intermediate, chroma]
  else [red, blue] = [chroma, intermediate]
  const match = value - chroma
  return {
    red: byte((red + match) * 255),
    green: byte((green + match) * 255),
    blue: byte((blue + match) * 255),
    alpha: byte(clamp(color.alpha, 0, 1) * 255)
  }
}

export function opaqueHighlightColor(value: string): string {
  const color = parseHighlightColor(value)
  return `#${byteHex(color.red)}${byteHex(color.green)}${byteHex(color.blue)}`
}

export function highlightBackgroundColor(value: string): string {
  const color = parseHighlightColor(value)
  const alpha = Math.round((color.alpha / 255) * 1000) / 1000
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`
}
