import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../format'
import { ADMIN_NS } from '../i18n'
import type { Message } from '../schemas'
import { BADGE, DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../styles'

interface MessageRowProps {
  message: Message
  open: boolean
  /** A change to this message is being saved. */
  busy: boolean
  /** Ids: the toggle is `${idPrefix}-toggle`, the panel `${idPrefix}-panel`. */
  idPrefix: string
  onToggle(): void
  onMarkUnread(): void
  onDelete(): void
}

const PREVIEW_LENGTH = 120

/** `mailto:` with the address encoded, except the @ (a stray ? or & must not become header fields). */
const mailto = (email: string): string => `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`

/**
 * One message as a disclosure. The toggle (in an h2, so the inbox can be browsed by headings) names
 * the sender, the date and the unread and delivery-failure marks; the start of the text sits under
 * it. The panel holds the whole text and its details, with Reply, Mark unread and Delete.
 */
export function MessageRow({ message, open, busy, idPrefix, onToggle, onMarkUnread, onDelete }: MessageRowProps) {
  const { t, i18n } = useTranslation(ADMIN_NS)
  const unread = message.readAt === null
  const failed = message.deliveryStatus === 'failed'
  const received = formatDateTime(message.createdAt, i18n.language)
  // By code points, so an emoji is never cut in half.
  const characters = [...message.message.replace(/\s+/g, ' ').trim()]
  const preview =
    characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join('')}…` : characters.join('')
  const toggleId = `${idPrefix}-toggle`
  const panelId = `${idPrefix}-panel`

  let delivery: string
  if (message.deliveryStatus === 'sent') delivery = t('messages.deliverySent')
  else if (failed) delivery = t('messages.deliveryFailedDetail', { error: message.deliveryError ?? '—' })
  else delivery = t('messages.deliveryPending')

  return (
    <li className={`border-t border-line py-4 ${unread ? 'bg-surface' : ''}`}>
      <h2>
        <button
          id={toggleId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-3 transition-colors duration-200 hover:text-accent"
        >
          {/* The {' '} text nodes only separate the parts in the button's name; flex layout ignores them. */}
          <span className="flex flex-wrap items-center gap-3">
            <span className={`wrap-anywhere ${unread ? 'font-semibold' : 'font-medium'}`}>{message.name}</span>{' '}
            {unread ? (
              <span className="font-mono text-xs uppercase tracking-label text-accent">{t('messages.unreadMark')}</span>
            ) : null}
          </span>{' '}
          <span className="flex flex-wrap items-center gap-3">
            {failed ? <span className={`${BADGE} border-line text-error`}>{t('messages.deliveryFailed')}</span> : null}{' '}
            <time dateTime={message.createdAt} className="text-sm text-muted">
              {received}
            </time>
          </span>
        </button>
      </h2>
      {open ? null : <p className="mt-1 px-3 text-sm text-muted wrap-anywhere">{preview}</p>}

      {open ? (
        <div id={panelId} className="mt-3 px-3">
          <p className="max-w-3xl wrap-anywhere">
            {message.message.split('\n').map((line, index) => (
              <Fragment key={index}>
                {index > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </p>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-3 text-sm">
            <dt className="text-muted">{t('messages.from')}</dt>
            <dd className="wrap-anywhere">
              {message.name} · {message.email}
            </dd>
            <dt className="text-muted">{t('messages.received')}</dt>
            <dd>
              <time dateTime={message.createdAt}>{received}</time>
            </dd>
            <dt className="text-muted">{t('messages.source')}</dt>
            <dd className="font-mono wrap-anywhere">{message.source === 'unknown' ? t('messages.sourceUnknown') : message.source}</dd>
            <dt className="text-muted">{t('messages.userAgent')}</dt>
            <dd className="wrap-anywhere">{message.userAgent ?? t('messages.notRecorded')}</dd>
            <dt className="text-muted">{t('messages.delivery')}</dt>
            <dd className={failed ? 'text-error wrap-anywhere' : 'wrap-anywhere'}>{delivery}</dd>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={mailto(message.email)} className={PRIMARY_BUTTON}>
              {t('messages.reply')}{' '}
              <span className="sr-only">{message.email}</span>
            </a>
            <button
              type="button"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onMarkUnread()
              }}
              className={SECONDARY_BUTTON}
            >
              {t('messages.markUnread')}
            </button>
            <button
              type="button"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onDelete()
              }}
              className={DANGER_BUTTON}
            >
              {t('messages.delete')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
