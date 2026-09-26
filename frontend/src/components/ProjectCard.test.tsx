import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResolvedProject } from '../content/resolved'
import i18n from '../i18n'
import { ProjectCard } from './ProjectCard'

/**
 * The real-project branch of the card, which the saved content does not exercise yet: every
 * shipped project is still a reserved slot. A fabricated project (in the resolved shape the API and
 * the static snapshot share) keeps the title, summary, link, chips and cover image under test, so
 * the owner's first real write-up cannot reach the site through an unverified code path.
 */
const REAL: ResolvedProject = {
  id: 'demo',
  placeholder: false,
  title: 'Demo project',
  summary: 'What it does.',
  tech: ['React', 'Data pipelines'],
  url: 'https://example.com/demo',
  image: null,
}
const IMAGE = { url: '/api/v1/files/0b7e7c1e-6f3a-4d2b-9a57-1c1b2f0e9d44', width: 1600, height: 900 }

describe('ProjectCard (real project)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the title, summary, chips and link from the project itself', () => {
    render(<ProjectCard project={REAL} index={1} />)

    expect(screen.getByRole('heading', { level: 3, name: /^Demo project/ })).toBeInTheDocument()
    expect(screen.getByText('What it does.')).toBeInTheDocument()

    const tech = screen.getByRole('list', { name: 'Technologies: Demo project' })
    expect(within(tech).getAllByRole('link').map((chip) => chip.firstChild?.textContent)).toEqual(['React', 'Data pipelines'])

    // The title is the card's link: it stretches over the card and opens in a new tab.
    const link = screen.getByRole('link', { name: 'Demo project (opens in a new tab)' })
    expect(link).toHaveAttribute('href', 'https://example.com/demo')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveClass('after:absolute', 'after:inset-0')
  })

  it('carries the border light on every card, a reserved slot too, and no cat', () => {
    for (const project of [REAL, { ...REAL, placeholder: true, url: null }]) {
      const { container, unmount } = render(<ProjectCard project={project} index={1} />)
      const card = container.querySelector('article')
      expect(card).toHaveClass('light-host')
      const light = card?.querySelector(':scope > .card-light')
      expect(light).toHaveAttribute('aria-hidden', 'true')
      expect(light?.querySelector('.card-light-glow > .card-light-ring')).not.toBeNull()
      // The cats stay on the tags; the card has the light instead.
      expect(card?.querySelector(':scope > .edge-cat-track')).toBeNull()
      unmount()
    }
  })

  it('carries no placeholder badge', () => {
    render(<ProjectCard project={REAL} index={1} />)
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument()
  })

  it('renders no card link when the project has no url (the chips keep theirs)', () => {
    const { container } = render(<ProjectCard project={{ ...REAL, url: null }} index={1} />)
    expect(container.querySelector('.card-link')).toBeNull()
    expect(screen.queryByRole('link', { name: /Demo project/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Demo project' })).toBeInTheDocument()
  })

  it('falls back to the slot copy for a project that arrives without its own text', () => {
    render(<ProjectCard project={{ ...REAL, title: null, summary: null }} index={2} />)
    expect(screen.getByRole('heading', { level: 3, name: /^Project 2/ })).toBeInTheDocument()
    expect(screen.getByText(i18n.t('content.projects.placeholder.summary'))).toBeInTheDocument()
  })

  it('shows the cover image from the API inside the parallax plane, in place of the hatch', () => {
    const { container } = render(<ProjectCard project={{ ...REAL, image: IMAGE }} index={1} />)
    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('src', `http://localhost:8000${IMAGE.url}`)
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('width', '1600')
    expect(image).toHaveAttribute('height', '900')
    expect(image).toHaveAttribute('loading', 'lazy')
    const plane = image?.closest('[data-plane]')
    expect(plane).not.toBeNull()
    // Decorative: the title and summary say what the project is.
    expect(plane?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(image).toBeVisible()
  })

  it('hides an image that cannot load, leaving the hatch plane', () => {
    const { container } = render(<ProjectCard project={{ ...REAL, image: IMAGE }} index={1} />)
    const image = container.querySelector('img')!
    fireEvent.error(image)
    expect(image).not.toBeVisible()
    expect(image.closest('[data-plane]')).toHaveClass('bg-hatch')
  })

  it('keeps the hatch plane when there is no image, and never shows one on a reserved slot', () => {
    const bare = render(<ProjectCard project={REAL} index={1} />)
    expect(bare.container.querySelector('img')).toBeNull()
    expect(bare.container.querySelector('[data-plane]')).toHaveClass('bg-hatch')
    bare.unmount()

    const slot = render(<ProjectCard project={{ ...REAL, placeholder: true, image: IMAGE }} index={1} />)
    expect(slot.container.querySelector('img')).toBeNull()
  })
})
