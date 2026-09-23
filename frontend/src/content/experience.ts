import { term, type Tag } from './tags'

/**
 * Work history, newest first.
 *
 * Structural data only: ids, dates, company names and tech tags. Every translatable sentence lives
 * in `i18n/locales/{en,zh-Hant}.json` under `content.experience.<id>`. Phase 4 replaces this module
 * with the content API, so the shape stays serialisable (no JSX, id-keyed, plain values).
 */
export interface ExperienceEntry {
  readonly id: string
  /** Company names keep their original form in both locales, so they are data, not a translation. */
  readonly company: string
  /**
   * `YYYY-MM`, the machine-readable value used by `<time datetime>`; the visible label is formatted
   * per locale (`formatMonth`), so a label can never disagree with the date it renders.
   */
  readonly start: string
  /** `null` means the role is current; the view then prints `content.experience.present`. */
  readonly end: string | null
  /** Key suffixes under `content.experience.<id>.bullets`, in reading order. */
  readonly bullets: readonly string[]
  readonly tech: readonly Tag[]
}

export const EXPERIENCE: readonly ExperienceEntry[] = [
  {
    id: 'sksys',
    company: 'BABYSOFT o/a SKSYS Corporation',
    start: '2023-11',
    end: null,
    bullets: ['pwa', 'revamp', 'escalation', 'support'],
    tech: ['TypeScript', 'JavaScript', 'Node.js', 'Express', 'REST APIs', 'PWA', 'Agile', 'Jira'],
  },
  {
    id: 'hactl',
    company: 'Hong Kong Air Cargo Terminals Limited (HACTL)',
    start: '2021-08',
    end: '2022-10',
    bullets: ['platform', 'enterprise', 'coordination'],
    tech: ['Microsoft Azure', term('dataPipelines'), 'Power BI', term('enterpriseApplications')],
  },
  {
    id: 'ivc',
    company: 'IVC Consulting Group',
    start: '2020-08',
    end: '2021-04',
    bullets: ['sap', 'requirements'],
    tech: ['ABAP', 'SAP ERP'],
  },
]
