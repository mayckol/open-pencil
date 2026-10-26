import type { SceneGraph } from '@open-pencil/scene-graph'

import { populateFigPage } from '#core/io/formats/fig'
import { withTextLayout } from '#core/io/formats/svg/text/layout'
import { computeAllLayouts } from '#core/layout'
import type { DocumentFontStatus } from '#core/text/font/status'
import { fontManager } from '#core/text/fonts'
import { prepareGraphFonts } from '#core/text/prepare'

import { renderNodesToPDF } from './export'
import type { PDFFontFace } from './fonts'
import type { PDFPageSpec } from './plan'

/**
 * Loads every font the text of these pages draws with, as the canvas does: the faces, the
 * characters remote fonts must cover, and the script and emoji fallbacks.
 */
export function preparePDFFonts(
  graph: SceneGraph,
  specs: readonly PDFPageSpec[]
): Promise<DocumentFontStatus> {
  return prepareGraphFonts(
    graph,
    specs.flatMap((spec) => spec.nodeIds)
  )
}

/**
 * Design pages other than the open one may still be unread, since `.fig` pages load on demand.
 * Reads the pages a `pages` export asks for, or every page, so planning sees their layers.
 */
export function readPDFPages(graph: SceneGraph, pageIds?: readonly string[]): void {
  // No ids, or an empty list, exports every page, as planPDFPages reads them.
  const ids = pageIds?.length ? pageIds : graph.getPages().map((page) => page.id)
  for (const pageId of ids) {
    populateFigPage(graph, pageId)
  }
}

/**
 * Loads the fonts the text of pages read by {@link readPDFPages} needs and lays them out, since
 * pages other than the open one have no layout yet, so every PDF page is complete.
 */
export async function preparePagesForPDF(
  graph: SceneGraph,
  specs: readonly PDFPageSpec[]
): Promise<DocumentFontStatus> {
  const status = await preparePDFFonts(graph, specs)
  for (const spec of specs) computeAllLayouts(graph, spec.pageId)
  return status
}

/** The faces the pages' text uses, with the files the canvas draws them from. */
export function pdfFontFaces(status: DocumentFontStatus): PDFFontFace[] {
  return status.faces.map((face) => {
    const data =
      face.status === 'available' ? fontManager.loadedData(face.family, face.style) : null
    if (data) return { family: face.family, style: face.style, data }
    const missing =
      face.reason === 'unsupported-format' ? 'unsupported font format' : 'font file not available'
    return { family: face.family, style: face.style, data, missing }
  })
}

/**
 * Layers as a one-page PDF with their text set as the canvas sets it: the fonts it draws with
 * loaded, and wrapped paragraphs kept on their lines.
 */
export async function renderNodesToLaidOutPDF(
  graph: SceneGraph,
  pageId: string,
  nodeIds: string[]
): Promise<Uint8Array | null> {
  await preparePDFFonts(graph, [{ pageId, nodeIds }])
  return withTextLayout((textLayout) => renderNodesToPDF(graph, pageId, nodeIds, { textLayout }))
}
