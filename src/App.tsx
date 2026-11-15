import { useEffect, useState, type ComponentType } from 'react'
import { CitationProvider } from './components/CitationProvider'
import { FootnoteScope } from './components/FootnoteScope'
import { Header } from './components/Header'
import { NarrowScreenNotice } from './components/NarrowScreenNotice'
import { ViewFrame } from './components/ViewFrame'
import type { ViewId, ViewProps } from './lib/route'
import { useRoute } from './lib/useRoute'
import { AuditBar } from './views/AuditBar'
import { Interpret } from './views/Interpret'
import { LabPartnerDock } from './views/LabPartnerDock'
import { Overview } from './views/Overview'
import { Rank } from './views/Rank'
import { Summarize } from './views/Summarize'

/** The browser tab's title on each view; the Overview is the app's own name. */
const VIEW_TITLES: Record<ViewId, string> = {
  overview: 'ZERO-DRAFT',
  summarize: 'Summarize, ZERO-DRAFT',
  rank: 'Rank, ZERO-DRAFT',
  interpret: 'Interpret, ZERO-DRAFT',
}

const VIEW_COMPONENTS: Record<ViewId, ComponentType<ViewProps>> = {
  overview: Overview,
  summarize: Summarize,
  rank: Rank,
  interpret: Interpret,
}

/**
 * The shell. The header, audit bar, Lab Partner dock and citation drawer (inside
 * CitationProvider) stay mounted on every view; only the main area changes.
 * FootnoteScope numbers the footnotes of the header and the current view together.
 */
export default function App() {
  const route = useRoute()
  const [dockOpen, setDockOpen] = useState(false)
  const View = VIEW_COMPONENTS[route.view]
  useEffect(() => {
    document.title = VIEW_TITLES[route.view]
  }, [route.view])

  return (
    <CitationProvider>
      <FootnoteScope>
        <div className="flex h-dvh flex-col overflow-hidden">
          <Header active={route.view} />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <AuditBar />
              <ViewFrame viewKey={route.view}>
                <View params={route.params} />
              </ViewFrame>
            </div>
            <LabPartnerDock open={dockOpen} onToggle={() => setDockOpen((open) => !open)} />
          </div>
        </div>
        <NarrowScreenNotice />
      </FootnoteScope>
    </CitationProvider>
  )
}
