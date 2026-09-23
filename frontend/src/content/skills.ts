import { term, type Tag } from './tags'

/**
 * Skill groups and credentials. Tool, framework and certification names are data (untranslated);
 * group labels, descriptive chips (`term(...)`, text under `content.terms.<id>`), the degree and the
 * spoken languages are i18n keys.
 */
export interface SkillGroup {
  readonly id: string
  readonly items: readonly Tag[]
}

export const SKILL_GROUPS: readonly SkillGroup[] = [
  {
    id: 'frontend',
    items: [
      'React',
      'Next.js',
      'Angular',
      'TypeScript',
      'JavaScript',
      'HTML5',
      'CSS3',
      'Tailwind CSS',
      'jQuery',
      term('responsiveUi'),
    ],
  },
  {
    id: 'backend',
    items: ['Node.js / Express', 'Java / Spring Boot', 'Python / Flask', 'REST APIs', 'Microservices', 'ABAP', 'NGINX'],
  },
  {
    id: 'data',
    items: ['PostgreSQL', 'MySQL', 'MS SQL', 'Oracle SQL', 'MongoDB', term('dataPipelines'), 'Power BI'],
  },
  {
    id: 'cloud',
    items: ['Microsoft Azure', 'Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Git', 'Bitbucket'],
  },
  {
    id: 'ai',
    items: [term('llmAssisted'), term('codingAgents'), term('promptDesign'), term('workflowAutomation')],
  },
  {
    id: 'ways',
    items: ['Agile / Scrum', 'Jira', term('fullSdlc'), term('documentation'), term('mentoring')],
  },
]

export interface Education {
  readonly id: string
  /** School names keep their original form in both locales. */
  readonly school: string
  readonly year: string
}

export const EDUCATION: readonly Education[] = [
  { id: 'uwe', school: 'University of the West of England, Bristol', year: '2020' },
]

export interface Certification {
  readonly id: string
  /** Certification names keep their original form; only the status suffix is translated. */
  readonly name: string
  readonly inProgress: boolean
}

export const CERTIFICATIONS: readonly Certification[] = [
  { id: 'az900', name: 'Microsoft Azure Fundamentals (AZ-900)', inProgress: false },
  { id: 'ccna', name: 'CCNA Routing & Switching', inProgress: false },
  { id: 'pmp', name: 'PMP', inProgress: true },
]

/** Key suffixes under `content.skills.credentials.languages`. */
export const SPOKEN_LANGUAGES = ['english', 'mandarin', 'cantonese'] as const
