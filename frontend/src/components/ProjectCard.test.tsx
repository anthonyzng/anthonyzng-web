import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Project } from '../content/projects'
import { term } from '../content/tags'
import i18n from '../i18n'
import { ProjectCard } from './ProjectCard'

/**
 * The real-project branch of the card, which no page exercises yet: every shipped project is still a
 * reserved slot. A fabricated project keeps the key paths, the link and the chips under test, so the
 * owner's first real write-up cannot reach the site through an unverified code path.
 */
const REAL: Project = {
  id: 'demo',
  placeholder: false,
  tech: ['React', term('dataPipelines')],
  url: 'https://example.com/demo',
}

describe('ProjectCard (real project)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
    i18n.addResourceBundle(
      'en',
      'translation',
      { content: { projects: { items: { demo: { title: 'Demo project', summary: 'What it does.' } } } } },
      true,
      true,
    )
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
    render(<ProjectCard project={{ ...REAL, url: undefined }} index={1} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 3, name: 'Demo project' })).toBeInTheDocument()
  })
})
