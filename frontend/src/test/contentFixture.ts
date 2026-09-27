import type { Locale, ResolvedContent } from '../content/resolved'

/**
 * The site content every test renders (setup.ts mocks `staticContent` with it), so tests never
 * depend on the saved snapshot, which `npm run content:sync` rewrites whenever the owner edits
 * content in the admin panel. Invented data only. It covers every rendering path the snapshot can
 * produce: a current and a past role, a real project with a cover image next to a reserved slot, a
 * translated chip, an in-progress certification, linked and unlinked credentials, two tools, an
 * archive entry with and one without a summary, and no CV (the CV row is tested through an API
 * payload). `src/content/snapshot.test.ts` checks the real snapshot files instead.
 */
const IMAGE = { url: '/api/v1/files/0b7e7c1e-6f3a-4d2b-9a57-1c1b2f0e9d44', width: 1600, height: 1200 }

const en: ResolvedContent = {
  locale: 'en',
  experience: [
    {
      id: 'acme',
      company: 'Acme Corp',
      companyUrl: 'https://acme.example',
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
      companyUrl: null,
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
    education: [
      { id: 'uni', degree: 'BSc Computing', school: 'Example University', url: 'https://uni.example/', year: '2018' },
    ],
    certifications: [
      { id: 'aws', name: 'AWS Certified Developer', url: 'https://certs.example/aws', inProgress: false },
      { id: 'pmp', name: 'PMP', url: null, inProgress: true },
    ],
    languages: [
      { id: 'english', name: 'English' },
      { id: 'cantonese', name: 'Cantonese' },
    ],
  },
  tools: [
    {
      id: 'tidy',
      name: 'Tidy',
      kind: 'Web app',
      summary: 'Cleans up pasted text.',
      tech: ['TypeScript', 'Automation'],
      url: 'https://tools.example/tidy',
    },
    { id: 'shipit', name: 'shipit', kind: 'CLI', summary: 'Deploys in one command.', tech: ['Go'], url: 'https://tools.example/shipit' },
  ],
  contact: {
    links: [
      { id: 'email', label: 'Email', href: 'mailto:hello@example.com', display: 'hello@example.com' },
      { id: 'github', label: 'GitHub', href: 'https://github.com/example', display: 'github.com/example' },
    ],
    location: 'Toronto, Canada',
  },
  archive: [
    {
      id: 'v1',
      kind: 'Portfolio',
      title: 'Portfolio, first version',
      summary: 'A static site.',
      month: '2021-05',
      url: 'https://v1.example.com/',
    },
    { id: 'post', kind: 'Blog', title: 'Notes on scroll motion', summary: null, month: '2023-02', url: 'https://blog.example/motion' },
  ],
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
  tools: [
    { ...en.tools[0], kind: '網頁應用程式', summary: '整理貼上的文字。', tech: ['TypeScript', '自動化'] },
    { ...en.tools[1], kind: '命令列工具', summary: '一個指令完成部署。' },
  ],
  contact: {
    links: [
      { ...en.contact.links[0], label: '電郵' },
      en.contact.links[1],
    ],
    location: '加拿大多倫多',
  },
  archive: [
    { ...en.archive[0], kind: '作品集', title: '作品集第一版', summary: '靜態網站。' },
    { ...en.archive[1], kind: '網誌', title: '滾動動畫筆記' },
  ],
  cv: null,
}

export const CONTENT_FIXTURE: Readonly<Record<Locale, ResolvedContent>> = { en, 'zh-Hant': zhHant }
