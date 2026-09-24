import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiHttpError, isAbortError } from '../../api/client'
import { isUnauthorized } from '../api'
import { useSession } from '../session/sessionContext'
import { useStatus } from '../shell/statusContext'

/** Translated texts: live-region progress and outcome, and the inline errors. */
export interface FileUploadMessages {
  uploading: string
  uploaded: string
  failed: string
  /**
   * The inline error for a file the server refused (a 422), by the refusal's `code` (`file_type`,
   * `file_too_large`, ...). A 413 (the body passed the route's cap) counts as `file_too_large`.
   */
  refusals: Readonly<Record<string, string>>
  /** A refusal whose code is not in `refusals`. */
  rejected: string
  /** Anything else (network, 5xx): nothing is known to be wrong with the file itself. */
  generic: string
  /** A new pick while an upload is on its way: it is refused, the first one goes on. */
  busy: string
}

interface FileUploadOptions<T> {
  /** A client-side refusal (a translated message), or null to send the file. */
  check(file: File): string | null
  upload(file: File, signal: AbortSignal): Promise<T>
  onUploaded(result: T): void
  messages: FileUploadMessages
}

const refusal = (messages: FileUploadMessages, code: string): string =>
  Object.hasOwn(messages.refusals, code) ? messages.refusals[code] : messages.rejected

/** The inline error for a failed upload: never the server's own text, which is English and meant for developers. */
function failureText(failure: unknown, messages: FileUploadMessages): string {
  if (!(failure instanceof ApiHttpError)) return messages.generic
  if (failure.status === 413) return refusal(messages, 'file_too_large')
  if (failure.status === 422) return refusal(messages, failure.code)
  return messages.generic
}

/**
 * The change handler of a file input that uploads at once (the CV, a project's cover image): the
 * file is checked here first so an obviously wrong one never travels, progress and outcome go to
 * the live region, and the server's verdict (a 422 by its code, a 413) becomes the inline error.
 * One upload at a time: a pick made while one is on its way is refused with `busy`. Aborting the
 * first would not stop the server once it has the body, so it could still land after the second
 * and leave the page showing a file the server has already replaced. Leaving the page aborts the
 * request, so a late answer never reports on a page the user has left.
 */
export function useFileUpload<T>({ check, upload, onUploaded, messages }: FileUploadOptions<T>) {
  const { expire } = useSession()
  const { announce } = useStatus()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // the same file can be picked again after a failure
    if (!file) return
    if (request.current) {
      announce(messages.busy, 'error')
      return
    }
    const refused = check(file)
    if (refused) {
      setError(refused)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setError(null)
    setUploading(true)
    announce(messages.uploading)
    try {
      const result = await upload(file, controller.signal)
      if (controller.signal.aborted) return // the page went away
      onUploaded(result)
      setError(null)
      announce(messages.uploaded, 'success')
    } catch (failure) {
      if (isAbortError(failure) || controller.signal.aborted) return
      if (isUnauthorized(failure)) {
        expire()
        return
      }
      setError(failureText(failure, messages))
      announce(messages.failed, 'error')
    } finally {
      if (request.current === controller) {
        request.current = null
        setUploading(false)
      }
    }
  }

  return { uploading, error, onChange: (event: ChangeEvent<HTMLInputElement>) => void onChange(event) }
}
