import { useTranslation } from 'react-i18next'
import { RevealItem } from '../components/RevealItem'
import { SectionShell } from '../components/SectionShell'
import { ToolCard } from '../components/ToolCard'
import { useResolvedContent } from '../content/contentContext'

/**
 * The tools the owner built, as a two-column grid of cards that each open the tool. The list is
 * the admin panel's (added, removed and ordered there); while it is empty a note says more is coming.
 */
export function Tools() {
  const { t } = useTranslation()
  const { tools } = useResolvedContent()

  return (
    <SectionShell id="tools" motionKey={tools.map((tool) => tool.id).join()}>
      {tools.length === 0 ? (
        <p className="font-mono text-sm text-muted">{t('content.tools.empty')}</p>
      ) : (
        <ul role="list" className="grid gap-6 md:grid-cols-2">
          {tools.map((tool, index) => (
            <li key={tool.id}>
              <RevealItem className="h-full [&>[data-reveal-inner]]:h-full">
                <ToolCard tool={tool} index={index} />
              </RevealItem>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  )
}
