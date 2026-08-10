import {
  useEffect,
  useId,
  useState,
  type PointerEvent,
  type CSSProperties,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  hsvaToRgba,
  normalizeHighlightColor,
  opaqueHighlightColor,
  parseHighlightColor,
  rgbaToHex,
  rgbaToHsva,
  type HsvaColor
} from './highlight-color'

interface Props {
  value: string
  label: string
  onConfirm(value: string): void
}

const DEFAULT_COLORS = [
  '#f5a524ff', '#ff4e45ff', '#3dd68cff', '#5b9dffff', '#c4b5fdff',
  '#ff6bcbff', '#4ecdc4ff', '#ffe66dff', '#ffffffff', '#000000ff'
]

function pointerRatio(event: PointerEvent<HTMLElement>): { x: number; y: number } {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
  }
}

function canonicalInput(value: string): string | null {
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
    ? normalizeHighlightColor(value)
    : null
}

export function HighlightColorButton(props: Props): ReactElement {
  const { t } = useTranslation('settings')
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<HsvaColor>(() => rgbaToHsva(parseHighlightColor(props.value)))
  const [hexValue, setHexValue] = useState(() => normalizeHighlightColor(props.value))
  const [hexValid, setHexValid] = useState(true)

  const rgba = hsvaToRgba(draft)
  const color = rgbaToHex(rgba)
  const opaque = opaqueHighlightColor(color)

  function resetDraft(): void {
    const normalized = normalizeHighlightColor(props.value)
    setDraft(rgbaToHsva(parseHighlightColor(normalized)))
    setHexValue(normalized)
    setHexValid(true)
  }

  function show(): void {
    resetDraft()
    setOpen(true)
  }

  function close(): void {
    setOpen(false)
  }

  function update(next: HsvaColor): void {
    setDraft(next)
    setHexValue(rgbaToHex(hsvaToRgba(next)))
    setHexValid(true)
  }

  function updateHex(value: string): void {
    setHexValue(value)
    const normalized = canonicalInput(value)
    setHexValid(normalized !== null)
    if (normalized) setDraft(rgbaToHsva(parseHighlightColor(normalized)))
  }

  function confirm(): void {
    if (!hexValid) return
    props.onConfirm(color)
    close()
  }

  function updateSaturationValue(event: PointerEvent<HTMLDivElement>): void {
    if (event.type === 'pointermove' && event.buttons !== 1) return
    const ratio = pointerRatio(event)
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture?.(event.pointerId)
    update({ ...draft, saturation: ratio.x, value: 1 - ratio.y })
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
      if (event.key === 'Enter' && !(event.target instanceof HTMLInputElement)) confirm()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, color, hexValid])

  const dialog = open && typeof document !== 'undefined' ? createPortal(
    <div className="hl-color-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <div className="hl-color-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="hl-color-dialog-head">
          <strong id={titleId}>{t('highlightRules.colorPicker.title')}</strong>
          <button type="button" className="hl-color-close" aria-label={t('highlightRules.colorPicker.cancel')} onClick={close}>×</button>
        </header>
        <div className="hl-color-dialog-body">
          <section className="hl-color-presets" aria-label={t('highlightRules.colorPicker.defaultColors')}>
            <span>{t('highlightRules.colorPicker.defaultColors')}</span>
            <div className="hl-color-preset-grid">
              {DEFAULT_COLORS.map((preset) => <button
                key={preset}
                type="button"
                className="hl-color-swatch checkerboard"
                style={{ '--swatch-color': preset } as CSSProperties}
                aria-label={preset}
                onClick={() => update(rgbaToHsva(parseHighlightColor(preset)))}
              />)}
            </div>
            <span>{t('highlightRules.colorPicker.selected')}</span>
            <div className="hl-color-selected checkerboard" style={{ '--swatch-color': color } as CSSProperties} />
          </section>
          <section className="hl-color-controls">
            <div
              className="hl-sv-canvas"
              style={{ '--picker-hue': `${draft.hue}` } as CSSProperties}
              onPointerDown={updateSaturationValue}
              onPointerMove={updateSaturationValue}
            >
              <span className="hl-sv-cursor" style={{ left: `${draft.saturation * 100}%`, top: `${(1 - draft.value) * 100}%` }} />
            </div>
            <label className="hl-color-slider-label">
              <span>{t('highlightRules.colorPicker.hue')}</span>
              <input
                className="hl-hue-slider"
                type="range"
                min="0"
                max="359"
                value={Math.round(draft.hue)}
                onChange={(event) => update({ ...draft, hue: Number(event.target.value) })}
              />
            </label>
            <label className="hl-color-slider-label">
              <span>{t('highlightRules.colorPicker.alpha')}</span>
              <input
                className="hl-alpha-slider"
                style={{ '--alpha-color': opaque } as CSSProperties}
                type="range"
                min="0"
                max="255"
                value={rgba.alpha}
                onChange={(event) => update({ ...draft, alpha: Number(event.target.value) / 255 })}
              />
            </label>
            <label className="hl-color-hex-label">
              <span>{t('highlightRules.colorPicker.hex')}</span>
              <input
                data-testid="highlight-color-hex"
                className={hexValid ? '' : 'invalid'}
                value={hexValue}
                spellCheck={false}
                maxLength={9}
                onChange={(event) => updateHex(event.target.value)}
              />
            </label>
          </section>
        </div>
        <footer className="hl-color-dialog-actions">
          <button data-testid="highlight-color-cancel" type="button" className="btn" onClick={close}>{t('highlightRules.colorPicker.cancel')}</button>
          <button data-testid="highlight-color-confirm" type="button" className="btn btn-primary" disabled={!hexValid} onClick={confirm}>{t('highlightRules.colorPicker.ok')}</button>
        </footer>
      </div>
    </div>, document.body
  ) : null

  return <>
    <button
      data-testid="highlight-color-open"
      type="button"
      className="hl-color-button checkerboard"
      style={{ '--swatch-color': normalizeHighlightColor(props.value) } as CSSProperties}
      aria-label={props.label}
      onClick={show}
    />
    {dialog}
  </>
}
