import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import type { ResolvedContent } from '../content/resolved'
import i18n from '../i18n'
import { queueJson } from '../test/api'
import { CONTENT_FIXTURE } from '../test/contentFixture'

/**
 * The sections render the content they are given: in tests the fixed fixture (test/setup.ts mocks
 * the saved snapshot with test/contentFixture.ts), or an API payload a test queues.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const region = (name: string) => screen.getByRole('region', { name })

/**
 * Matches an element by its whole text, including text split across children (a date range is a
 * <time>, a dash and a second <time>). getByText's default matcher only reads direct text nodes.
 */
function wholeText(text: string) {
  return (_content: string, element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() === text
}

/** The fixture of a locale, with changes only the API could know about. */
function editable(locale: 'en' | 'zh-Hant' = 'en'): { -readonly [K in keyof ResolvedContent]: ResolvedContent[K] } {
  return structuredClone(CONTENT_FIXTURE[locale])
}

const CV = { url: '/api/v1/files/5d0c4b8e-2f7a-4c1d-8e3b-9a6f1e2d3c4b', filename: 'CV.pdf', size: 184_320, updatedAt: '2026-09-23T10:00:00Z' }

describe('section content', () => {
  const content = CONTENT_FIXTURE.en

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
  })

  describe('Experience', () => {
    it('lists every role, in order, with company, place, dates, bullets and tech', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const experience = region('Experience')

      const roles = within(experience)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
      expect(roles).toEqual(['Lead Developer', 'Software Engineer'])

      for (const entry of content.experience) {
        expect(within(experience).getByText(entry.company)).toBeInTheDocument()
        expect(within(experience).getByText(entry.location)).toBeInTheDocument()
        for (const bullet of entry.bullets) expect(within(experience).getByText(bullet)).toBeInTheDocument()
        // Each tech list is named after its own employer, so the lists are told apart by name
        // rather than by position: a screen-reader rotor shows whose stack it is.
        const list = within(experience).getByRole('list', { name: `Technologies: ${entry.company}` })
        const tags = within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
        expect(tags).toEqual(entry.tech)
      }

      expect(within(experience).getByText(wholeText('Mar 2024 – Present'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('Jun 2019 – Dec 2023'))).toBeInTheDocument()
    })

    it('gives every date a machine-readable value and no end date to the current role', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const experience = region('Experience')

      const current = within(experience).getByText(wholeText('Mar 2024 – Present'))
      const times = current.querySelectorAll('time')
      expect(times).toHaveLength(1)
      expect(times[0]).toHaveAttribute('datetime', '2024-03')

      // Every <time> carries the date it displays: the label is derived from the stored value.
      const datetimes = [...experience.querySelectorAll('time')].map((time) => time.getAttribute('datetime'))
      expect(datetimes).toEqual(['2024-03', '2019-06', '2023-12'])
    })
  })

  describe('Projects', () => {
    it('shows a real project with its cover image next to a slot that announces itself', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const projects = region('Projects')

      // A slot remains, so the note that write-ups are coming stays.
      expect(within(projects).getByText('Selected projects are being written up.')).toBeInTheDocument()
      const titles = within(projects)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
      expect(titles).toEqual(['Orbit dashboard', 'Project 2'])
      expect(within(projects).getAllByText('Placeholder')).toHaveLength(1)
      expect(within(projects).getByRole('list', { name: 'Technologies: Orbit dashboard' })).toBeInTheDocument()
      expect(within(projects).getByRole('link', { name: 'View project Orbit dashboard' })).toHaveAttribute(
        'href',
        'https://example.com/orbit',
      )
      // Only the real project has an image; the slot keeps the hatch plane.
      const images = projects.querySelectorAll('img')
      expect(images).toHaveLength(1)
      expect(images[0]).toHaveAttribute('src', 'http://localhost:8000/api/v1/files/0b7e7c1e-6f3a-4d2b-9a57-1c1b2f0e9d44')
    })

    it('drops the note once every card is real work', async () => {
      const payload = editable()
      payload.projects = [payload.projects[0]]
      queueJson(payload)
      renderAt('/en')
      const projects = region('Projects')
      // The fixture's slot is on screen until the API payload is swapped in.
      await waitFor(() => expect(within(projects).queryByText('Placeholder')).toBeNull())
      expect(within(projects).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
        'Orbit dashboard',
      ])
      expect(within(projects).queryByText('Selected projects are being written up.')).toBeNull()
    })
  })

  describe('Skills', () => {
    it('renders every group as a chip list labelled by its heading', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const skills = region('Skills')

      for (const group of content.skills.groups) {
        const list = within(skills).getByRole('list', { name: group.label })
        const items = within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
        expect(items).toEqual(group.items)
      }
    })

    it('renders the credentials block', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const skills = region('Skills')

      expect(within(skills).getByRole('heading', { level: 3, name: 'Credentials' })).toBeInTheDocument()
      expect(within(skills).getByText('BSc Computing')).toBeInTheDocument()
      expect(within(skills).getByText('Example University')).toBeInTheDocument()
      expect(within(skills).getByText('2018')).toBeInTheDocument()
      // Each certification keeps its own name; only the status suffix comes from the locale.
      expect(within(skills).getByText(wholeText('AWS Certified Developer'))).toBeInTheDocument()
      expect(within(skills).getByText(wholeText('PMP (in progress)'))).toBeInTheDocument()
      for (const language of ['English', 'Cantonese']) {
        expect(within(skills).getByText(language)).toBeInTheDocument()
      }
    })
  })

  describe('Contact', () => {
    it('links every channel in order, says where the owner is and offers the form', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = region('Contact')

      const links = within(contact).getAllByRole('link')
      expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
        ['hello@example.com', 'mailto:hello@example.com'],
        ['github.com/example', 'https://github.com/example'],
      ])
      const labels = within(contact)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('p')?.textContent)
      // No CV in this content, so there is no download row.
      expect(labels).toEqual(['Email', 'GitHub', 'Based in'])
      expect(within(contact).getByText('Toronto, Canada')).toBeInTheDocument()
      // The form replaced the "on its way" note.
      expect(within(contact).getByRole('form', { name: 'Send a message' })).toBeInTheDocument()
      expect(within(contact).getByRole('button', { name: 'Send message' })).toBeInTheDocument()
      expect(within(contact).queryByText(/on the way/i)).not.toBeInTheDocument()
    })

    it('offers the uploaded CV as a download, after the channels and before the location', async () => {
      queueJson({ ...editable(), cv: CV })
      renderAt('/en')
      const contact = region('Contact')
      const download = await within(contact).findByRole('link', { name: 'Download CV (PDF, 180 KB)' })
      expect(download).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(download).toHaveAttribute('download')
      expect(download).toHaveAttribute('type', 'application/pdf')

      const labels = within(contact)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('p')?.textContent)
      expect(labels).toEqual(['Email', 'GitHub', 'CV', 'Based in'])
    })

    it('labels the CV download in Chinese on the Chinese page', async () => {
      queueJson({ ...editable('zh-Hant'), cv: CV })
      renderAt('/zh-hant')
      const download = await screen.findByRole('link', { name: '下載履歷（PDF，180 KB）' })
      expect(download).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(within(region('聯絡')).getByText('履歷')).toBeInTheDocument()
    })
  })

  describe('Traditional Chinese', () => {
    it('renders the Chinese content with Chinese dates and suffixes, names untranslated', async () => {
      renderAt('/zh-hant')
      await screen.findByRole('heading', { level: 2, name: '工作經驗' })

      const experience = region('工作經驗')
      expect(within(experience).getByRole('heading', { level: 3, name: '首席開發員' })).toBeInTheDocument()
      expect(within(experience).getByText('Acme Corp')).toBeInTheDocument()
      // Dates read as Chinese dates, never "Mar 2024" inside Chinese prose.
      expect(within(experience).getByText(wholeText('2024年3月 – 至今'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('2019年6月 – 2023年12月'))).toBeInTheDocument()
      expect(within(experience).getByRole('list', { name: '技術：Acme Corp' })).toBeInTheDocument()
      expect(
        within(within(experience).getByRole('list', { name: '技術：Acme Corp' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['TypeScript', '數據管道'])

      const skills = region('技能')
      expect(within(skills).getByRole('list', { name: '前端' })).toBeInTheDocument()
      // Chinese punctuation for a Chinese suffix: full-width brackets, no Latin space.
      expect(within(skills).getByText(wholeText('PMP（進行中）'))).toBeInTheDocument()

      expect(within(region('項目作品')).getAllByText('預留位置')).toHaveLength(1)
      expect(within(region('聯絡')).getByText('加拿大多倫多')).toBeInTheDocument()
    })
  })

  it('leaves no placeholder copy in the sections that carry real content', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    for (const name of ['Experience', 'Skills', 'Contact']) {
      const section = region(name)
      expect(within(section).queryByText(/placeholder/i)).not.toBeInTheDocument()
      // An image plane only belongs to a project card.
      expect(section.querySelector('[data-plane]')).toBeNull()
    }
  })
})
