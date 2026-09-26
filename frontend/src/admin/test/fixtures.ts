import type {
  CertificationItem,
  CvRef,
  ExperienceItem,
  Message,
  ProjectItem,
  SiteTextItem,
  SkillGroupItem,
  Summary,
} from '../schemas'
import { ok, type Handler } from './mockApi'

/** Invented test data only: no real person, address or message appears in the admin tests. */

export const ADMIN_EMAIL = 'admin@example.com'

/** `POST /auth/login` (and `/auth/login/totp`): signed in, or a code is due first. */
export const loginResult = (totpRequired = false) => ({ email: ADMIN_EMAIL, totpRequired })
const UPDATED = '2026-09-01T10:00:00Z'

export const experience = (): ExperienceItem[] => [
  {
    slug: 'acme',
    sortOrder: 0,
    company: 'Acme Corp',
    companyUrl: 'https://acme.example',
    start: '2023-01',
    end: null,
    tech: ['React', { en: 'Data pipelines', 'zh-Hant': '數據管道' }],
    translations: {
      en: { role: 'Lead Developer', location: 'Springfield', bullets: ['Built the shop.', 'Led the team.'] },
      'zh-Hant': { role: '首席開發員', location: '春田', bullets: ['建立網店。', '帶領團隊。'] },
    },
    updatedAt: UPDATED,
  },
  {
    slug: 'globex',
    sortOrder: 1,
    company: 'Globex',
    companyUrl: null,
    start: '2020-02',
    end: '2022-12',
    tech: [],
    translations: {
      en: { role: 'Developer', location: 'Shelbyville', bullets: ['Wrote code.'] },
      'zh-Hant': { role: '開發員', location: '謝爾比維爾', bullets: ['編寫程式。'] },
    },
    updatedAt: UPDATED,
  },
]

export const certifications = (): CertificationItem[] => [
  { slug: 'cloud101', sortOrder: 0, name: 'Cloud Basics 101', inProgress: false, updatedAt: UPDATED },
  { slug: 'pm202', sortOrder: 3, name: 'Project Management 202', inProgress: true, updatedAt: UPDATED },
]

export const projects = (): ProjectItem[] => [
  {
    slug: 'shop',
    sortOrder: 0,
    placeholder: false,
    url: 'https://example.com/shop',
    tech: ['React'],
    translations: {
      en: { title: 'Web shop', summary: 'An online shop.' },
      'zh-Hant': { title: '網店', summary: '網上商店。' },
    },
    image: null,
    updatedAt: UPDATED,
  },
  {
    slug: 'slotTwo',
    sortOrder: 1,
    placeholder: true,
    url: null,
    tech: [],
    translations: { en: { title: null, summary: null }, 'zh-Hant': { title: null, summary: null } },
    image: null,
    updatedAt: UPDATED,
  },
]

export const skillGroups = (): SkillGroupItem[] => [
  {
    slug: 'frontend',
    sortOrder: 0,
    items: ['React', { en: 'Responsive UI', 'zh-Hant': '響應式介面' }],
    translations: { en: { label: 'Front-end' }, 'zh-Hant': { label: '前端' } },
    updatedAt: UPDATED,
  },
]

export const siteTexts = (): SiteTextItem[] => [
  {
    slug: 'contact_location',
    translations: { en: { text: 'Springfield' }, 'zh-Hant': { text: '春田' } },
    updatedAt: UPDATED,
  },
]

export const cv = (): CvRef => ({ url: '/api/v1/files/cv-1', filename: 'resume.pdf', size: 245_760, updatedAt: UPDATED })

export const summary = (overrides: Partial<Summary> = {}): Summary => ({
  counts: {
    experience: 2,
    projects: 2,
    'skill-groups': 1,
    education: 1,
    certifications: 2,
    languages: 3,
    'contact-links': 3,
    'site-texts': 1,
  },
  unreadMessages: 2,
  cv: cv(),
  totpEnabled: true,
  ...overrides,
})

export const message = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello there.\nCould we talk about a project?',
  createdAt: '2026-09-20T08:30:00Z',
  readAt: null,
  deliveryStatus: 'sent',
  deliveryError: null,
  source: '3fa2c19b0e4d',
  userAgent: 'TestBrowser/1.0',
  ...overrides,
})

/** A signed-in session with a dashboard summary: the routes every admin page needs. */
export const signedIn = (): Record<string, Handler> => ({
  'GET /auth/me': ok({ email: ADMIN_EMAIL }),
  'GET /admin/summary': ok(summary()),
})
