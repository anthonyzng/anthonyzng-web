import { ICON_BUTTON } from '../styles'
import { Icon, type IconName } from './Icon'

interface IconButtonProps {
  id?: string
  icon: IconName
  /** The accessible name (also the tooltip): an icon never names a control on its own. */
  label: string
  onClick(): void
  /** Unavailable but still focusable and announced as such (aria-disabled), so focus is never lost. */
  unavailable?: boolean
}

export function IconButton({ id, icon, label, onClick, unavailable = false }: IconButtonProps) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={unavailable || undefined}
      onClick={() => {
        if (!unavailable) onClick()
      }}
      className={ICON_BUTTON}
    >
      <Icon name={icon} />
    </button>
  )
}
