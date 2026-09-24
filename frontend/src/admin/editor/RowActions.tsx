import { useTranslation } from 'react-i18next'
import { IconButton } from '../components/IconButton'
import { ADMIN_NS } from '../i18n'

export type RowAction = 'up' | 'down' | 'remove'

interface RowActionsProps {
  /** Ids are `${idPrefix}-up|down|remove`, so the list can move focus after a change. */
  idPrefix: string
  /** Names the row in the button labels, e.g. "chip 3" or "bullet 2". */
  rowName: string
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  onAction(action: RowAction): void
}

/** Move up, move down and remove for one row of a list editor (chips, bullets). */
export function RowActions({ idPrefix, rowName, isFirst, isLast, canRemove, onAction }: RowActionsProps) {
  const { t } = useTranslation(ADMIN_NS)
  return (
    <div className="flex shrink-0 items-center gap-2">
      <IconButton
        id={`${idPrefix}-up`}
        icon="up"
        label={t('rows.moveUp', { row: rowName })}
        unavailable={isFirst}
        onClick={() => onAction('up')}
      />
      <IconButton
        id={`${idPrefix}-down`}
        icon="down"
        label={t('rows.moveDown', { row: rowName })}
        unavailable={isLast}
        onClick={() => onAction('down')}
      />
      <IconButton
        id={`${idPrefix}-remove`}
        icon="remove"
        label={t('rows.remove', { row: rowName })}
        unavailable={!canRemove}
        onClick={() => onAction('remove')}
      />
    </div>
  )
}
