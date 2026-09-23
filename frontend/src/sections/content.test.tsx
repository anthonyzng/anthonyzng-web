import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { EXPERIENCE } from '../content/experience'
import { CERTIFICATIONS, EDUCATION, SKILL_GROUPS, SPOKEN_LANGUAGES } from '../content/skills'
import { isTerm, type Tag } from '../content/tags'
import i18n from '../i18n'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const region = (name: string) => screen.getByRole('region', { name })

/** A chip's visible text: a proper noun as written, a term through the active locale. */
const tagText = (tag: Tag) => (isTerm(tag) ? i18n.t(`content.terms.${tag.term}`) : tag)

/**
 * Matches an element by its whole text, including text split across children (a date range is a
 * <time>, a dash and a second <time>). getByText's default matcher only reads direct text nodes.
 */
function wholeText(text: string) {
  return (_content: string, element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() === text
}

describe('section content', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.dataset.theme = 'light'
    // The address is build-time configuration, not a property of the checkout: state the unset case
    // explicitly, so a developer's own frontend/.env cannot decide what these tests assert.
    vi.stubEnv('VITE_CONTACT_EMAIL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Experience', () => {
    it('lists every role, newest first, with company, place, dates, bullets and tech', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const experience = region('Experience')

      const roles = within(experience)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
      expect(roles).toEqual(['Software Developer / Assistant Manager', 'Senior IT Coordinator', 'ABAP Programmer'])

      for (const entry of EXPERIENCE) {
        expect(within(experience).getByText(entry.company)).toBeInTheDocument()
        for (const bullet of entry.bullets) {
          const text = i18n.t(`content.experience.${entry.id}.bullets.${bullet}`)
          expect(within(experience).getByText(text)).toBeInTheDocument()
        }
        // Each tech list is named after its own employer, so the three are told apart by name
        // rather than by position: a screen-reader rotor shows whose stack it is.
        const list = within(experience).getByRole('list', { name: `Technologies: ${entry.company}` })
        const tags = within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
        expect(tags).toEqual(entry.tech.map(tagText))
      }

      expect(within(experience).getByText(wholeText('Nov 2023 – Present'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('Aug 2021 – Oct 2022'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('Aug 2020 – Apr 2021'))).toBeInTheDocument()
      expect(within(experience).getByText('Markham, ON, Canada')).toBeInTheDocument()
    })

    it('gives every date a machine-readable value and no end date to the current role', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const experience = region('Experience')

      const current = within(experience).getByText(wholeText('Nov 2023 – Present'))
      const times = current.querySelectorAll('time')
      expect(times).toHaveLength(1)
      expect(times[0]).toHaveAttribute('datetime', '2023-11')

      // Every <time> carries the date it displays: the label is derived from the stored value.
      for (const time of experience.querySelectorAll('time')) {
        expect(time.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}$/)
      }
      expect(experience.querySelectorAll('time')).toHaveLength(EXPERIENCE.length + EXPERIENCE.filter((e) => e.end).length)
    })
  })

  describe('Projects', () => {
    it('shows the card layout filled with slots that announce themselves as placeholders', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const projects = region('Projects')

      expect(within(projects).getByText('Selected projects are being written up.')).toBeInTheDocument()
      const titles = within(projects)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
      expect(titles).toEqual(['Project 1', 'Project 2'])
      expect(within(projects).getAllByText('Placeholder')).toHaveLength(titles.length)
      // A slot carries no tech tags and no link of its own: nothing here can read as real work.
      expect(within(projects).queryAllByRole('list')).toHaveLength(0)
      expect(within(projects).queryAllByRole('link')).toHaveLength(0)
    })
  })

  describe('Skills', () => {
    it('renders every group as a chip list labelled by its heading', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const skills = region('Skills')

      for (const group of SKILL_GROUPS) {
        const list = within(skills).getByRole('list', { name: i18n.t(`content.skills.groups.${group.id}`) })
        const items = within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent)
        expect(items).toEqual(group.items.map(tagText))
      }
    })

    it('renders the credentials block', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const skills = region('Skills')

      expect(within(skills).getByRole('heading', { level: 3, name: 'Credentials' })).toBeInTheDocument()
      expect(within(skills).getByText('BSc (Hons) Information Technology — First Class Honours')).toBeInTheDocument()
      for (const entry of EDUCATION) {
        expect(within(skills).getByText(entry.school)).toBeInTheDocument()
        expect(within(skills).getByText(entry.year)).toBeInTheDocument()
      }
      // Each certification keeps its own name; only the status suffix comes from the locale.
      for (const certification of CERTIFICATIONS) {
        const text = certification.inProgress
          ? `${certification.name}${i18n.t('content.skills.credentials.certifications.inProgress')}`
          : certification.name
        expect(within(skills).getByText(wholeText(text))).toBeInTheDocument()
      }
      expect(within(skills).getByText(wholeText('PMP (in progress)'))).toBeInTheDocument()
      for (const language of SPOKEN_LANGUAGES) {
        expect(within(skills).getByText(i18n.t(`content.skills.credentials.languages.${language}`))).toBeInTheDocument()
      }
    })
  })

  describe('Contact', () => {
    it('links GitHub, says where the owner is and that the form is still coming', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = region('Contact')

      expect(within(contact).getByRole('link', { name: 'github.com/anthonyzng' })).toHaveAttribute(
        'href',
        'https://github.com/anthonyzng',
      )
      expect(within(contact).getByText('Ontario, Canada')).toBeInTheDocument()
      expect(within(contact).getByText(i18n.t('content.contact.formNote'))).toBeInTheDocument()
      // No LinkedIn URL was supplied, so no LinkedIn row is invented.
      expect(within(contact).queryByText(/linkedin/i)).not.toBeInTheDocument()
    })

    it('omits the email row while no address is configured', async () => {
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = region('Contact')
      expect(within(contact).queryByText('Email')).not.toBeInTheDocument()
      expect(contact.querySelector('a[href^="mailto:"]')).toBeNull()
    })

    it('shows the configured address in full, as a mailto link', async () => {
      vi.stubEnv('VITE_CONTACT_EMAIL', ' someone@example.com ')
      renderAt('/en')
      await screen.findByRole('heading', { level: 1 })
      const contact = region('Contact')
      expect(within(contact).getByText('Email')).toBeInTheDocument()
      expect(within(contact).getByRole('link', { name: 'someone@example.com' })).toHaveAttribute(
        'href',
        'mailto:someone@example.com',
      )
    })
  })

  describe('Traditional Chinese', () => {
    it('translates the prose and keeps company, technology and certification names', async () => {
      renderAt('/zh-hant')
      await screen.findByRole('heading', { level: 2, name: '工作經驗' })

      const experience = region('工作經驗')
      expect(within(experience).getByRole('heading', { level: 3, name: '軟件開發員 / 助理經理' })).toBeInTheDocument()
      expect(within(experience).getByText('BABYSOFT o/a SKSYS Corporation')).toBeInTheDocument()
      // Dates read as Chinese dates, never "Nov 2023" inside Chinese prose.
      expect(within(experience).getByText(wholeText('2023年11月 – 至今'))).toBeInTheDocument()
      expect(within(experience).getByText(wholeText('2021年8月 – 2022年10月'))).toBeInTheDocument()
      expect(within(experience).getByText('加拿大安大略省萬錦市')).toBeInTheDocument()
      expect(
        within(experience).getByRole('list', { name: '技術：BABYSOFT o/a SKSYS Corporation' }),
      ).toBeInTheDocument()

      const skills = region('技能')
      expect(within(skills).getByRole('list', { name: '前端' })).toBeInTheDocument()
      // Descriptive chips are translated; only genuine names stay in their original form.
      const ai = within(skills).getByRole('list', { name: 'AI 開發' })
      expect(
        within(ai)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['LLM 輔助開發', 'AI 編程代理（Claude Code）', '提示詞設計', 'AI 工作流程自動化'])
      expect(within(skills).getByText('Microsoft Azure Fundamentals (AZ-900)')).toBeInTheDocument()
      // Chinese punctuation for a Chinese suffix: full-width brackets, no Latin space.
      expect(within(skills).getByText(wholeText('PMP（進行中）'))).toBeInTheDocument()

      expect(within(region('項目作品')).getAllByText('預留位置')).toHaveLength(2)
      expect(within(region('聯絡')).getByText('加拿大安大略省')).toBeInTheDocument()
    })
  })

  it('leaves no placeholder copy in the sections that now carry real content', async () => {
    renderAt('/en')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    for (const name of ['Experience', 'Skills', 'Contact']) {
      const section = region(name)
      expect(within(section).queryByText(/placeholder/i)).not.toBeInTheDocument()
      // The hatch plane is the empty image frame: only a project card may still show one.
      expect(section.querySelector('[data-plane]')).toBeNull()
    }
  })
})
