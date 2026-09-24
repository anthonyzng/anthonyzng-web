import { API_BASE_URL } from '../env'

/**
 * The address the browser loads for a file the API serves (a project image, the CV). Payloads carry
 * a root-relative path (validated in `schemas.ts`); the API origin comes from the build, so the same
 * payload works against a local backend and production.
 */
export const fileUrl = (path: string): string => `${API_BASE_URL}${path}`
