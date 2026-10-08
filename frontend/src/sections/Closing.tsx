import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { fileUrl } from '../api/files'
import { useInkWriting } from '../animations/useInkWriting'
import { useMeteorContact, type Rgb } from '../animations/useMeteorContact'
import { useMotionAllowed } from '../animations/useMotionAllowed'
import { ContactDialog, type ContactDialogHandle } from '../components/ContactDialog'
import { useResolvedContent } from '../content/contentContext'
import { formatFileSize } from '../i18n/formatFileSize'
import { useDocumentTheme } from '../theme/useDocumentTheme'

interface Channel {
  key: string
  label: string
  value: string
  href: string
  download?: boolean
  /** The email channel: it opens the contact form instead of a mail app (which many visitors lack). */
  mail: boolean
}

/** Meteor colours by stellar temperature: a hot blue star, a violet nebula, a K-type amber, the accent's emerald. */
const METEOR_RGB: Record<string, Rgb> = {
  email: [124, 199, 255],
  linkedin: [183, 155, 255],
  github: [255, 196, 107],
  cv: [94, 240, 192],
}
const SPARE_RGB: readonly Rgb[] = [
  [255, 138, 170],
  [140, 220, 255],
  [255, 225, 140],
]
const meteorRgb = (key: string, index: number): Rgb => METEOR_RGB[key] ?? SPARE_RGB[index % SPARE_RGB.length]

const TITLE = 'text-[clamp(2.6rem,11vw,8.5rem)] leading-none'

/**
 * The contact section, as the page's closing screen, in each theme's world. Dark: the channels are
 * meteors of their own colours drifting through the night sky (`useMeteorContact`); in turn one swings
 * in beside "Contact me", which takes its colour and, while it does, is that channel's link; a bar of
 * real links, the location and "Send a message" (`ContactDialog`) sits at the foot. Light: a sheet of
 * cracked paper with the channels as brush icons on its top edge, the paper plane (the form) ringed
 * with splashed ink beside them; ink drops from an icon and writes the channel's name below the title
 * (`useInkWriting`), and that word is its link. In both, the email channel opens the contact form (a
 * mailto link does nothing without a mail app, and the form delivers to the same inbox). The moving
 * pictures are decorative; the bar (dark) and the icons (light) are the accessible way in.
 */
export function Closing() {
  const { t, i18n } = useTranslation()
  const { contact, cv } = useResolvedContent()
  const theme = useDocumentTheme()
  const scope = useRef<HTMLElement>(null)
  const dialog = useRef<ContactDialogHandle>(null)
  const openForm = useCallback(() => dialog.current?.open(), [])

  const channels: Channel[] = [
    ...contact.links.map((link) => ({ key: link.id, label: link.label, value: link.display, href: link.href, mail: link.href.startsWith('mailto:') })),
    ...(cv
      ? [
          {
            key: 'cv',
            label: t('content.contact.labels.cv'),
            value: t('content.contact.cvDownload', { size: formatFileSize(cv.size, i18n.language) }),
            href: fileUrl(cv.url),
            download: true,
            mail: false,
          },
        ]
      : []),
  ]
  const activate = useCallback(
    (channel: Channel | undefined) => {
      if (!channel) return
      if (channel.mail) {
        openForm()
        return
      }
      const link = document.createElement('a')
      link.href = channel.href
      if (channel.download) link.download = ''
      link.click()
    },
    [openForm],
  )

  return (
    <section
      ref={scope}
      id="contact"
      data-closing
      aria-labelledby="contact-title"
      className="relative isolate flex min-h-[max(calc(100svh-var(--header-h)),36rem)] flex-col overflow-hidden"
    >
      {theme === 'dark' ? (
        <NightContact scope={scope} channels={channels} dialog={dialog} openForm={openForm} activate={activate} />
      ) : (
        <InkContact scope={scope} channels={channels} dialog={dialog} openForm={openForm} activate={activate} />
      )}
    </section>
  )
}

interface ScreenProps {
  scope: RefObject<HTMLElement | null>
  channels: Channel[]
  dialog: RefObject<ContactDialogHandle | null>
  openForm: () => void
  activate: (channel: Channel | undefined) => void
}

/** "Contact" and the location, above the screen's picture. */
function TopRow() {
  const { t } = useTranslation()
  const { contact } = useResolvedContent()
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-6xl justify-between gap-4 px-5 font-mono text-xs uppercase tracking-label text-muted sm:px-8">
      <span className="text-accent">{t('nav.contact')}</span>
      {contact.location ? (
        <span>
          {t('content.contact.labels.location')} <span className="text-fg">{contact.location}</span>
        </span>
      ) : null}
    </div>
  )
}

/** A channel as a link, or as the button that opens the form (email). */
function ChannelControl({ channel, openForm, className, label, children, onPreview, brush }: {
  channel: Channel
  openForm: () => void
  className: string
  label?: string
  children: ReactNode
  onPreview?: () => void
  /** Marks a brush icon, which the ink scene finds (in channel order) to drip from. */
  brush?: boolean
}) {
  const handlers = { ...(onPreview ? { onPointerEnter: onPreview, onFocus: onPreview } : {}), ...(brush ? { 'data-brush': '' } : {}) }
  return channel.mail ? (
    <button type="button" aria-haspopup="dialog" aria-label={label} onClick={openForm} className={className} {...handlers}>
      {children}
    </button>
  ) : (
    <a href={channel.href} download={channel.download || undefined} type={channel.download ? 'application/pdf' : undefined} aria-label={label} className={className} {...handlers}>
      {children}
    </a>
  )
}

function NightContact({ scope, channels, dialog, openForm, activate }: ScreenProps) {
  const { t } = useTranslation()
  const { contact } = useResolvedContent()
  const motion = useMotionAllowed()
  const canvas = useRef<HTMLCanvasElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [aligned, setAligned] = useState<number | null>(null)
  const looks = channels.map((channel, index) => ({ label: channel.label, rgb: meteorRgb(channel.key, index) }))
  useMeteorContact(scope, canvas, title, looks, motion, setAligned, (index) => activate(channels[index]))
  const alignedChannel = aligned === null ? undefined : channels[aligned]

  return (
    <>
      {/* The meteors take the pointer (each is clickable); everything that reads sits above them. */}
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
      {/* Bottom padding: the bar stays clear of the section dock floating at the foot of the page. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col pt-10 pb-24 md:pb-28">
        <TopRow />
        {/* The title has the space between the labels and the bar to itself, centred in it, with room
            above and below for the meteors that line up beside it. */}
        <div className="relative flex flex-1 items-center justify-center py-16">
          <h2 ref={title} id="contact-title" tabIndex={-1} className={`text-center font-semibold tracking-[-0.045em] outline-none ${TITLE}`}>
            {t('home.closing.title')}
          </h2>
          {/* While a meteor is level with the title, the title is that channel's link. */}
          {alignedChannel ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ChannelControl
                channel={alignedChannel}
                openForm={openForm}
                label={t('home.closing.titleLink', { channel: alignedChannel.label })}
                className={`pointer-events-auto rounded-xl font-semibold tracking-[-0.045em] text-transparent ${TITLE}`}
              >
                {t('home.closing.title')}
              </ChannelControl>
            </div>
          ) : null}
        </div>
        <div className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-4 border-t border-line px-5 pt-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <ul role="list" aria-label={t('home.closing.channels')} className="flex flex-wrap gap-x-5 gap-y-0 md:gap-x-8">
            {channels.map((channel, index) => (
              <li key={channel.key}>
                <ChannelControl channel={channel} openForm={openForm} className="group inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: `rgb(${meteorRgb(channel.key, index).join(' ')})` }} />
                  <span className="underline decoration-line underline-offset-4 group-hover:decoration-accent">{channel.label}</span>{' '}
                  <span className="sr-only">{channel.value}</span>
                </ChannelControl>
              </li>
            ))}
            {contact.location ? <li className="sr-only">{`${t('content.contact.labels.location')} ${contact.location}`}</li> : null}
          </ul>
          <ContactDialog
            ref={dialog}
            buttonClassName="inline-flex min-h-11 shrink-0 cursor-pointer items-center self-start rounded-full bg-accent px-6 text-sm font-medium text-accent-fg transition-opacity duration-200 hover:opacity-90 md:self-auto"
          />
        </div>
      </div>
    </>
  )
}

function InkContact({ scope, channels, dialog, openForm }: ScreenProps) {
  const { t, i18n } = useTranslation()
  const motion = useMotionAllowed()
  const sheet = useRef<HTMLCanvasElement>(null)
  const ink = useRef<HTMLCanvasElement>(null)
  const brushes = useRef<HTMLUListElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const [written, setWritten] = useState<number | null>(null)
  const controls = useInkWriting(scope, sheet, ink, brushes, word, channels, motion, setWritten)
  const writtenChannel = written === null ? undefined : channels[written]
  // The brush hand is Latin only; Chinese titles stay in the page's face.
  const brushFace = i18n.language === 'en' ? 'font-brush font-normal' : 'font-semibold tracking-[-0.02em]'

  return (
    <>
      <canvas ref={sheet} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
      <canvas ref={ink} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
      <div className="relative z-10 flex flex-1 flex-col pt-5 pb-10">
        <TopRow />
        <ul ref={brushes} role="list" aria-label={t('home.closing.channels')} className="mt-8 flex flex-wrap justify-center gap-[clamp(10px,2.5vw,22px)] px-5">
          {channels.map((channel, index) => (
            <li key={channel.key}>
              <ChannelControl
                channel={channel}
                openForm={openForm}
                label={`${channel.label} ${channel.value}`}
                className="ink-brush"
                brush
                onPreview={() => controls.current.drop(index)}
              >
                <ChannelIcon kind={channel.key} />
              </ChannelControl>
            </li>
          ))}
          <li>
            <ContactDialog
              ref={dialog}
              buttonClassName="ink-brush ink-brush-plane"
              buttonLabel={t('home.closing.send')}
              buttonContent={
                <>
                  <InkSplash />
                  <PlaneIcon />
                </>
              }
            />
          </li>
        </ul>
        {/* The title sits in the space below the icons, raised so the written word has room under it. */}
        <div className="flex flex-1 items-center justify-center pt-12 pb-[clamp(8rem,22vh,13rem)]">
          <h2 id="contact-title" tabIndex={-1} className={`pointer-events-none text-center outline-none ${TITLE} ${brushFace}`}>
            {t('home.closing.title')}
          </h2>
        </div>
      </div>
      {/* The written word is its channel's link; the scene places it over the ink. */}
      {/* Pointing at it, or focusing it, dampens the paper round the word and keeps it there. */}
      <div
        ref={word}
        className="absolute z-20"
        hidden={!writtenChannel}
        onPointerEnter={() => controls.current.setHover(true)}
        onPointerLeave={() => controls.current.setHover(false)}
        onFocus={() => controls.current.setHover(true)}
        onBlur={() => controls.current.setHover(false)}
      >
        {writtenChannel ? (
          <ChannelControl channel={writtenChannel} openForm={openForm} label={`${writtenChannel.label} ${writtenChannel.value}`} className="block size-full rounded-md">
            <span aria-hidden="true" />
          </ChannelControl>
        ) : null}
      </div>
    </>
  )
}

/** A channel's brush icon: envelope, LinkedIn, a git branch, a document; any other channel a link. */
function ChannelIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    email: (
      <>
        <path d="M4 7h16v10H4z" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    linkedin: (
      <>
        <path d="M6 10v8M6 6.5v.5" />
        <path d="M10.5 18v-8m0 3.5c0-2 1.3-3.5 3-3.5s3 1.2 3 3.5V18" />
      </>
    ),
    github: (
      <>
        <circle cx="7" cy="6" r="2" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="9" r="2" />
        <path d="M7 8v8M17 11c0 3-3 3.5-6 4.5L7 16" />
      </>
    ),
    cv: (
      <>
        <path d="M7 3.5h7l4 4V20.5H7z" />
        <path d="M14 3.5v4h4M9.5 12h6M9.5 15h6M9.5 18h4" />
      </>
    ),
  }
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {paths[kind] ?? <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />}
    </svg>
  )
}

function PlaneIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3 3 10.5l7 3m11-10.5-7.5 18-3.5-7.5m11-10.5L10 13.5" />
    </svg>
  )
}

/** Splashed ink round the send button: a ragged brush ring, a paler wash, flicked droplets (fixed shape). */
function InkSplash() {
  const c = 32
  const ring = (ro: number, ri: number, jo: number, ji: number, seed: number) => {
    let s = seed
    const r = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    const pt = (a: number, rad: number) => `${(c + Math.cos(a) * rad).toFixed(2)} ${(c + Math.sin(a) * rad).toFixed(2)}`
    const outer: string[] = []
    const inner: string[] = []
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2
      outer.push(pt(a, ro + (r() - 0.5) * jo + (r() < 0.12 ? r() * 3.5 : 0)))
      inner.push(pt(-a, ri + (r() - 0.5) * ji))
    }
    return `M${outer.join('L')}ZM${inner.join('L')}Z`
  }
  const drops = [
    [0.4, 29, 1.4],
    [1.3, 30.5, 0.8],
    [2.2, 28.5, 1.9],
    [3.1, 31, 0.9],
    [3.9, 29.5, 1.2],
    [4.7, 30, 1.6],
    [5.6, 28.8, 0.7],
  ]
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className="ink-splash">
      <path d={ring(27, 22.5, 3, 2, 7)} fill="rgb(20 20 18 / .18)" fillRule="evenodd" />
      <path d={ring(25, 22, 2.6, 1.6, 29)} fill="rgb(20 20 18 / .92)" fillRule="evenodd" />
      <g fill="rgb(20 20 18 / .88)">
        {drops.map(([a, d, rad]) => (
          <circle key={a} cx={(c + Math.cos(a) * d).toFixed(2)} cy={(c + Math.sin(a) * d).toFixed(2)} r={rad} />
        ))}
      </g>
      <path d="M52.5 20.3L58.6 16.9" stroke="rgb(20 20 18 / .85)" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}
