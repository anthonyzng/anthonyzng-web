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

/** What a sighted reader sees: the text without the screen-reader-only hints ("opens in a new tab"). */
function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  for (const hint of copy.querySelectorAll('.sr-only')) hint.remove()
  return copy.textContent?.trim() ?? ''
}

/** The chips of a tag list, as their visible text. */
const chips = (list: HTMLElement) => within(list).getAllByRole('listitem').map(visibleText)

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
        expect(chips(list)).toEqual(entry.tech)
      }

      expect(within(experience).getByText(wholeText('Mar 2024 – Present'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('Jun 2019 – Dec 2023'))).toBeInTheDocument()
    })

    it('links a company name to its website in a new tab, when it has one', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const experience = region('Experience')
      const acme = within(experience).getByRole('link', { name: 'Acme Corp (opens in a new tab)' })
      expect(acme).toHaveAttribute('href', 'https://acme.example')
      expect(acme).toHaveAttribute('target', '_blank')
      expect(acme).toHaveAttribute('rel', 'noopener noreferrer')
      // Globex has no website: its name is plain text.
      expect(within(experience).queryByRole('link', { name: /Globex/ })).toBeNull()
      expect(within(experience).getByText('Globex Ltd')).toBeInTheDocument()
    })

    it('drops a company website the browser cannot parse, keeping the name', async () => {
      const payload = editable()
      payload.experience = [{ ...payload.experience[0], companyUrl: 'javascript:alert(1)' }]
      queueJson(payload)
      renderAt('/en')
      const experience = region('Experience')
      await waitFor(() => expect(within(experience).queryByText('Globex Ltd')).toBeNull())
      expect(within(experience).queryByRole('link', { name: /Acme/ })).toBeNull()
      expect(within(experience).getByText('Acme Corp')).toBeInTheDocument()
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
      const titles = within(projects).getAllByRole('heading', { level: 3 }).map(visibleText)
      expect(titles).toEqual(['Orbit dashboard', 'Project 2'])
      expect(within(projects).getAllByText('Placeholder')).toHaveLength(1)
      expect(within(projects).getByRole('list', { name: 'Technologies: Orbit dashboard' })).toBeInTheDocument()
      // The whole card is the link, named by its title; the slot is not a link.
      const link = within(projects).getByRole('link', { name: 'Orbit dashboard (opens in a new tab)' })
      expect(link).toHaveAttribute('href', 'https://example.com/orbit')
      expect(link).toHaveAttribute('target', '_blank')
      expect(within(projects).queryByRole('link', { name: /Project 2/ })).toBeNull()
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
      expect(within(projects).getAllByRole('heading', { level: 3 }).map(visibleText)).toEqual(['Orbit dashboard'])
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
        expect(chips(list)).toEqual(group.items)
      }
    })

    it('makes every chip a web search for the term, in the page language, in a new tab', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const react = within(region('Skills')).getByRole('link', { name: 'React (search the web in a new tab)' })
      expect(react).toHaveAttribute('href', 'https://www.google.com/search?q=what%20is%20React')
      expect(react).toHaveAttribute('target', '_blank')
      expect(react).toHaveAttribute('rel', 'noopener noreferrer')
      // Decorative, and hidden until the chip is hovered or focused.
      expect(react.querySelector('.edge-cat-track')).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders the credentials block', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const skills = region('Skills')

      expect(within(skills).getByRole('heading', { level: 3, name: 'Credentials' })).toBeInTheDocument()
      expect(within(skills).getByText('BSc Computing')).toBeInTheDocument()
      expect(within(skills).getByText('2018')).toBeInTheDocument()
      // A school or certification with a web address links its name there, in a new tab.
      const school = within(skills).getByRole('link', { name: 'Example University (opens in a new tab)' })
      expect(school).toHaveAttribute('href', 'https://uni.example/')
      expect(school).toHaveAttribute('target', '_blank')
      expect(school).toHaveAttribute('rel', 'noopener noreferrer')
      const aws = within(skills).getByRole('link', { name: 'AWS Certified Developer (opens in a new tab)' })
      expect(aws).toHaveAttribute('href', 'https://certs.example/aws')
      // Each certification keeps its own name; only the status suffix comes from the locale.
      expect(within(skills).getByText(wholeText('PMP (in progress)'))).toBeInTheDocument()
      expect(within(skills).queryByRole('link', { name: /PMP/ })).toBeNull()
      for (const language of ['English', 'Cantonese']) {
        expect(within(skills).getByText(language)).toBeInTheDocument()
      }
    })
  })

  describe('Contact', () => {
    const contactSection = () => region('Contact me')

    it('links every channel in order, says where the owner is and offers the form', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = contactSection()
      expect(contact).toHaveAttribute('id', 'contact')
      expect(within(contact).getByRole('heading', { level: 2, name: 'Contact me' })).toHaveAttribute('tabindex', '-1')

      // Light theme: the channels are brush icons, named by channel and address.
      const channels = within(contact).getByRole('list', { name: 'Contact channels' })
      // The email channel opens the contact form (a mailto link does nothing without a mail app).
      expect(within(channels).getByRole('button', { name: 'Email hello@example.com' })).toHaveAttribute(
        'aria-haspopup',
        'dialog',
      )
      // Like every link to another site, a channel opens in a new tab, and its name says so.
      const links = within(channels).getAllByRole('link')
      expect(
        links.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]),
      ).toEqual([['GitHub github.com/example (opens in a new tab)', 'https://github.com/example', '_blank', 'noopener noreferrer']])
      // The paper plane, last in the row, opens the form.
      expect(within(channels).getByRole('button', { name: 'Send a message' })).toHaveAttribute('aria-haspopup', 'dialog')
      expect(within(contact).getByText('Toronto, Canada')).toBeInTheDocument()
    })

    it('in dark mode, lists the channels as links in the bar under the meteors', async () => {
      document.documentElement.dataset.theme = 'dark'
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = contactSection()
      expect(within(contact).getByRole('heading', { level: 2, name: 'Contact me' })).toHaveAttribute('tabindex', '-1')
      const channels = within(contact).getByRole('list', { name: 'Contact channels' })
      expect(within(channels).getByRole('button', { name: 'Email hello@example.com' })).toHaveAttribute('aria-haspopup', 'dialog')
      const github = within(channels).getByRole('link', { name: 'GitHub github.com/example (opens in a new tab)' })
      expect(github).toHaveAttribute('href', 'https://github.com/example')
      expect(github).toHaveAttribute('target', '_blank')
      expect(github).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(contact).getByRole('button', { name: 'Send a message' })).toBeInTheDocument()
      // No meteor is beside the title without motion, so the title is no link.
      expect(within(contact).queryByRole('link', { name: /^Contact me:/ })).toBeNull()
      document.documentElement.dataset.theme = 'light'
    })

    it('opens the form from the email channel', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      within(contactSection()).getByRole('button', { name: 'Email hello@example.com' }).click()
      const dialog = await screen.findByRole('dialog', { name: 'Send a message' })
      expect(within(dialog).getByRole('form', { name: 'Send a message' })).toBeInTheDocument()
    })

    it('opens the form in a dialog and closes it again', async () => {
      const { container } = renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const open = within(contactSection()).getByRole('button', { name: 'Send a message' })
      expect(open).toHaveAttribute('aria-haspopup', 'dialog')
      open.click()
      const dialog = await screen.findByRole('dialog', { name: 'Send a message' })
      expect(within(dialog).getByRole('form', { name: 'Send a message' })).toBeInTheDocument()
      expect(open).toHaveAttribute('aria-expanded', 'true')
      within(dialog).getByRole('button', { name: 'Close' }).click()
      await waitFor(() => expect(open).toHaveAttribute('aria-expanded', 'false'))
      expect(container.querySelector('dialog')?.open).toBe(false)
    })

    it('offers the uploaded CV as a download, after the channels', async () => {
      queueJson({ ...editable(), cv: CV })
      renderAt('/en')
      const channels = within(contactSection()).getByRole('list', { name: 'Contact channels' })
      const download = await within(channels).findByRole('link', { name: 'CV Download CV (PDF, 180 KB)' })
      expect(download).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(download).toHaveAttribute('download')
      expect(download).toHaveAttribute('type', 'application/pdf')
      expect(within(channels).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
        'https://github.com/example',
        `http://localhost:8000${CV.url}`,
      ])
    })

    it('labels the CV download in Chinese on the Chinese page', async () => {
      queueJson({ ...editable('zh-Hant'), cv: CV })
      renderAt('/zh-hant')
      const download = await screen.findByRole('link', { name: '履歷 下載履歷（PDF，180 KB）' })
      expect(download).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(within(region('聯絡我')).getByRole('button', { name: '發送訊息' })).toBeInTheDocument()
    })
  })

  describe('Tools', () => {
    it('renders one card per tool, each opening the tool in a new tab', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const tools = region('Tools')
      expect(within(tools).getByText('04 / 04')).toBeInTheDocument()

      const cards = within(tools).getAllByRole('article')
      expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
        'Tidy (opens in a new tab)',
        'shipit (opens in a new tab)',
      ])
      const [tidy] = cards
      expect(within(tidy).getByText('Web app')).toBeInTheDocument()
      expect(within(tidy).getByText('Cleans up pasted text.')).toBeInTheDocument()
      const link = within(tidy).getByRole('link', { name: 'Tidy (opens in a new tab)' })
      expect(link).toHaveAttribute('href', 'https://tools.example/tidy')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      // The name's link stretches over the card; the chips stay their own links above it.
      expect(link).toHaveClass('after:absolute', 'after:inset-0')
      expect(chips(within(tidy).getByRole('list', { name: 'Technologies: Tidy' }))).toEqual(['TypeScript', 'Automation'])
    })

    it('says more is coming while the list is empty', async () => {
      queueJson({ ...editable(), tools: [] })
      renderAt('/en')
      expect(await within(region('Tools')).findByText('New tools are on the way.')).toBeInTheDocument()
      expect(within(region('Tools')).queryAllByRole('article')).toHaveLength(0)
    })
  })

  describe('Archive', () => {
    it('lists the entries after the contact screen, each row a link in a new tab', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const archive = region('Archive')
      expect(archive).toHaveAttribute('id', 'archive')
      // After the closing screen in the page, and no numbered chapter.
      expect(region('Contact me').compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(within(archive).getByRole('heading', { level: 2, name: 'Archive' })).toHaveAttribute('tabindex', '-1')

      const rows = within(archive).getAllByRole('link')
      expect(rows.map((row) => row.getAttribute('href'))).toEqual(['https://v1.example.com/', 'https://blog.example/motion'])
      expect(rows[0]).toHaveAttribute('target', '_blank')
      expect(rows[0]).toHaveAccessibleName('May 2021 Portfolio Portfolio, first version A static site. (opens in a new tab)')
      expect(within(rows[0]).getByText('May 2021')).toHaveAttribute('datetime', '2021-05')
      // No summary, no second line.
      expect(rows[1]).toHaveAccessibleName('Feb 2023 Blog Notes on scroll motion (opens in a new tab)')
    })

    it('is left out while there is nothing in it', async () => {
      queueJson({ ...editable(), archive: [] })
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Archive' })).toBeNull())
    })
  })

  describe('the hero and "In brief"', () => {
    it('show the texts and roles the admin panel sets', async () => {
      queueJson({
        ...editable(),
        hero: { eyebrow: 'Showcase', nameFirst: 'Tony', nameLast: 'N.', roles: [{ id: 'lead', text: 'Team Lead' }] },
        statement: { label: 'About me', intro: 'New words from the API.' },
      })
      renderAt('/en')
      const hero = await screen.findByRole('region', { name: 'Tony N.' })
      expect(within(hero).getByRole('heading', { level: 1, name: 'Tony N.' })).toBeInTheDocument()
      expect(within(hero).getByText('Showcase')).toBeInTheDocument()
      expect(within(hero).getByText('Team Lead')).toBeInTheDocument()
      expect(within(hero).queryByText('Software Builder')).toBeNull()
      const statement = region('About me')
      // The screen-reader copy and the visual copy, both with the new words.
      expect(within(statement).getAllByText('New words from the API.')).toHaveLength(2)
    })
  })

  describe('CV download in the hero and the dock', () => {
    it('offers nothing while no CV is uploaded', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('link', { name: /Download CV/ })).toBeNull()
    })

    it('puts the download beside the roles and at the end of the dock', async () => {
      queueJson({ ...editable(), cv: CV })
      renderAt('/en')
      const hero = await screen.findByRole('region', { name: 'Anthony Ng' })
      const heroLink = await within(hero).findByRole('link', { name: 'Download CV PDF · 180 KB' })
      expect(heroLink).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(heroLink).toHaveAttribute('download')
      expect(heroLink).toHaveAttribute('type', 'application/pdf')

      const dock = screen.getByRole('navigation', { name: 'Sections' })
      const dockLink = within(dock).getByRole('link', { name: 'Download CV (PDF, 180 KB)' })
      expect(dockLink).toHaveTextContent('CV')
      expect(dockLink).toHaveAttribute('href', `http://localhost:8000${CV.url}`)
      expect(dockLink).toHaveAttribute('download')
      // The section links come first, the download last.
      const links = within(dock).getAllByRole('link')
      expect(links.at(-1)).toBe(dockLink)
      expect(links.map((link) => link.textContent)).toEqual(['Top', 'Experience', 'Projects', 'Skills', 'Tools', 'Contact', 'CV'])
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
      expect(chips(within(experience).getByRole('list', { name: '技術：Acme Corp' }))).toEqual(['TypeScript', '數據管道'])
      // Chinese pages search in Chinese.
      expect(within(experience).getByRole('link', { name: 'TypeScript （在新分頁搜尋網絡）' })).toHaveAttribute(
        'href',
        `https://www.google.com/search?q=${encodeURIComponent('TypeScript 是什麼')}`,
      )

      const skills = region('技能')
      expect(within(skills).getByRole('list', { name: '前端' })).toBeInTheDocument()
      // Chinese punctuation for a Chinese suffix: full-width brackets, no Latin space.
      expect(within(skills).getByText(wholeText('PMP（進行中）'))).toBeInTheDocument()

      expect(within(region('項目作品')).getAllByText('預留位置')).toHaveLength(1)
      expect(within(region('聯絡我')).getByText('加拿大多倫多')).toBeInTheDocument()
    })
  })

  it('leaves no placeholder copy in the sections that carry real content', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    for (const name of ['Experience', 'Skills', 'Contact me']) {
      const section = region(name)
      expect(within(section).queryByText(/placeholder/i)).not.toBeInTheDocument()
      // An image plane only belongs to a project card.
      expect(section.querySelector('[data-plane]')).toBeNull()
    }
  })
})
