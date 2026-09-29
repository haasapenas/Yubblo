import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import type { CommandPickerState } from './use-command-picker'
import './command-picker.css'

export function CommandPicker({ picker }: { picker: CommandPickerState }): ReactElement | null {
  const { t } = useTranslation('chat', { i18n })
  if (!picker.open) return null
  return (
    <div className="mention-menu command-menu" role="listbox">
      <div className="mention-menu-title">{t('commandList.title')}</div>
      {picker.commands.map((command, index) => (
        <button
          key={command.name}
          type="button"
          role="option"
          aria-selected={index === picker.activeIndex}
          className={`mention-item command-item${index === picker.activeIndex ? ' active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault()
            picker.pick(command)
          }}
          onMouseEnter={() => picker.setActiveIndex(index)}
        >
          <span className="command-name">
            /{command.name}
            {command.args ? <span className="command-args"> {command.args}</span> : null}
          </span>
          <span className="command-desc">{t(command.descriptionKey)}</span>
        </button>
      ))}
    </div>
  )
}
