import { CircleCheck } from 'lucide-react'
import { getSource } from '../lib/claims'
import type { Figure } from '../lib/figures'

/**
 * A figure cut from a NASA document, in the citation drawer: shown as printed, on white like the
 * page, with where it is from. Its numbers are checked against the page's text (check:claims).
 */
export function ClaimFigure({ figure }: { figure: Figure }) {
  const source = getSource(figure.sourceId)
  return (
    <figure className="flex flex-col gap-2">
      <img
        src={`${import.meta.env.BASE_URL}${figure.src}`}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        className="h-auto w-full rounded-sm bg-white"
      />
      <figcaption className="flex flex-col gap-1 text-sm leading-5 text-muted">
        <span>
          As printed in the {source?.short ?? 'source'}
          {figure.reportPage !== null && <>, p. {figure.reportPage}</>} (PDF p. {figure.pdfPage}), with the space
          before its number narrowed. The PDF’s text layer garbles the equation, so it is shown as an image.
        </span>
        <span className="flex items-center gap-2 text-emerald">
          <CircleCheck aria-hidden="true" className="size-4" />
          Its numbers checked against the page
        </span>
      </figcaption>
    </figure>
  )
}
