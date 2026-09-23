import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResolvedProject } from '../content/resolved'
import i18n from '../i18n'
import { ProjectCard } from './ProjectCard'

/**
 * The real-project branch of the card, which no page exercises yet: every shipped project is still a
 * reserved slot. A fabricated project (in the resolved shape the API and the static snapshot share)
 * keeps the title, summary, link and chips under test, so the owner's first real write-up cannot
 * reach the site through an unverified code path.
 */
const REAL: ResolvedProject = {
  id: 'demo',
  placeholder: false,
  title: 'Demo project',
  summary: 'What it does.',
  tech: ['React', 'Data pipelines'],
  url: 'https://example.com/demo',
}

describe('ProjectCard (real project)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the title, summary, chips and link from the project itself', () => {
    render(<ProjectCard project={REAL} index={1} />)

    expect(screen.getByRole('heading', { level: 3, name: 'Demo project' })).toBeInTheDocument()
    expect(screen.getByText('What it does.')).toBeInTheDocument()

    const tech = screen.getByRole('list', { name: 'Technologies: Demo project' })
    expect(
      within(tech)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['React', 'Data pipelines'])

    const link = screen.getByRole('link', { name: /Demo project/ })
    expect(link).toHaveAttribute('href', 'https://example.com/demo')
    expect(link).toHaveAccessibleName('View project Demo project')
  })

  it('carries no placeholder badge', () => {
    render(<ProjectCard project={REAL} index={1} />)
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument()
  })

  it('renders no link when the project has no url', () => {
    render(<ProjectCard project={{ ...REAL, url: null }} index={1} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 3, name: 'Demo project' })).toBeInTheDocument()
  })

  it('falls back to the slot copy for a project that arrives without its own text', () => {
    render(<ProjectCard project={{ ...REAL, title: null, summary: null }} index={2} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Project 2' })).toBeInTheDocument()
    expect(screen.getByText(i18n.t('content.projects.placeholder.summary'))).toBeInTheDocument()
  })
})
