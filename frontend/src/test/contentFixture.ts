import type { Locale, ResolvedContent } from '../content/resolved'

/**
 * The site content every test renders (setup.ts mocks `staticContent` with it), so tests never
 * depend on the saved snapshot, which `npm run content:sync` rewrites whenever the owner edits
 * content in the admin panel. Invented data only. It covers every rendering path the snapshot can
 * produce: a current and a past role, a real project with a cover image next to a reserved slot, a
 * translated chip, an in-progress certification and no CV (the CV row is tested through an API
 * payload). `src/content/snapshot.test.ts` checks the real snapshot files instead.
 */
const IMAGE = { url: '/api/v1/files/0b7e7c1e-6f3a-4d2b-9a57-1c1b2f0e9d44', width: 1600, height: 1200 }

const en: ResolvedContent = {
  locale: 'en',
  experience: [
    {
      id: 'acme',
      company: 'Acme Corp',
      role: 'Lead Developer',
      location: 'Toronto, ON, Canada',
      start: '2024-03',
      end: null,
      bullets: ['Built the ordering platform.', 'Led a team of four developers.'],
      tech: ['TypeScript', 'Data pipelines'],
    },
    {
      id: 'globex',
      company: 'Globex Ltd',
      role: 'Software Engineer',
      location: 'Hong Kong',
      start: '2019-06',
      end: '2023-12',
      bullets: ['Maintained the billing system.'],
      tech: ['Python'],
    },
  ],
  projects: [
    {
      id: 'orbit',
      placeholder: false,
      title: 'Orbit dashboard',
      summary: 'A realtime fleet dashboard.',
      tech: ['React', 'FastAPI'],
      url: 'https://example.com/orbit',
      image: IMAGE,
    },
    { id: 'slotTwo', placeholder: true, title: null, summary: null, tech: [], url: null, image: null },
  ],
  skills: {
    groups: [
      { id: 'frontend', label: 'Front-end', items: ['React', 'Responsive UI/UX'] },
      { id: 'ai', label: 'AI development', items: ['Prompt design'] },
    ],
    education: [{ id: 'uni', degree: 'BSc Computing', school: 'Example University', year: '2018' }],
    certifications: [
      { id: 'aws', name: 'AWS Certified Developer', inProgress: false },
      { id: 'pmp', name: 'PMP', inProgress: true },
    ],
    languages: [
      { id: 'english', name: 'English' },
      { id: 'cantonese', name: 'Cantonese' },
    ],
  },
  contact: {
    links: [
      { id: 'email', label: 'Email', href: 'mailto:hello@example.com', display: 'hello@example.com' },
      { id: 'github', label: 'GitHub', href: 'https://github.com/example', display: 'github.com/example' },
    ],
    location: 'Toronto, Canada',
  },
  cv: null,
}

const zhHant: ResolvedContent = {
  locale: 'zh-Hant',
  experience: [
    {
      ...en.experience[0],
      role: '首席開發員',
      location: '加拿大安大略省多倫多',
      bullets: ['建立訂購平台。', '帶領四人開發團隊。'],
      tech: ['TypeScript', '數據管道'],
    },
    { ...en.experience[1], role: '軟件工程師', location: '香港', bullets: ['維護計費系統。'] },
  ],
  projects: [
    { ...en.projects[0], title: '軌道儀表板', summary: '即時車隊儀表板。' },
    en.projects[1],
  ],
  skills: {
    groups: [
      { id: 'frontend', label: '前端', items: ['React', '響應式 UI/UX'] },
      { id: 'ai', label: 'AI 開發', items: ['提示詞設計'] },
    ],
    education: [{ ...en.skills.education[0], degree: '計算機理學士' }],
    certifications: en.skills.certifications,
    languages: [
      { id: 'english', name: '英文' },
      { id: 'cantonese', name: '廣東話' },
    ],
  },
  contact: {
    links: [
      { ...en.contact.links[0], label: '電郵' },
      en.contact.links[1],
    ],
    location: '加拿大多倫多',
  },
  cv: null,
}

export const CONTENT_FIXTURE: Readonly<Record<Locale, ResolvedContent>> = { en, 'zh-Hant': zhHant }
