import type { ShapedTextGlyph } from '@open-pencil/fig/node-change'
import type { SceneGraph } from '@open-pencil/scene-graph'

import { withTextShaper } from '#core/canvas/text/shape'
import { getCanvasKit } from '#core/canvaskit'
import { renderNodesToSVG, type SVGExportOptions } from '#core/io/formats/svg/export'
import { shownText } from '#core/text/case'
import { prepareGraphFonts } from '#core/text/prepare'

import type { SVGCharacterEdges, SVGTextLayout } from './lines'

/**
 * Runs `render` with the line breaks the canvas gives each text node (same paragraph builder and
 * fonts), so a wrapped paragraph stays wrapped in SVG and PDF. Without CanvasKit, `render` gets no
 * layout and only explicit newlines start a new line.
 */
export async function withTextLayout<T>(
  render: (textLayout: SVGTextLayout | undefined) => Promise<T>
): Promise<T> {
  const ck = await getCanvasKit().catch(() => null)
  if (!ck) return render(undefined)
  return withTextShaper(ck, (shape) =>
    render((node) => {
      // Shaped lines are cut by character index, which the text's case must keep.
      if (shownText(node).length !== node.text.length) return null
      const shaped = shape(node)
      if (!shaped?.baselines.length) return null
      const characters = characterEdges(shaped.glyphs)
      return shaped.baselines.map((line) => ({
        start: line.firstCharacter,
        end: line.endCharacter,
        x: line.position.x,
        y: line.position.y,
        width: line.width,
        characters
      }))
    })
  )
}

/** The left and right edges of the glyphs each character is drawn with. */
function characterEdges(glyphs: readonly ShapedTextGlyph[]): Map<number, SVGCharacterEdges> {
  const edges = new Map<number, SVGCharacterEdges>()
  for (const glyph of glyphs) {
    if (glyph.firstCharacter === undefined) continue
    const left = glyph.x
    const right = glyph.x + glyph.advance
    const known = edges.get(glyph.firstCharacter)
    edges.set(
      glyph.firstCharacter,
      known
        ? { left: Math.min(known.left, left), right: Math.max(known.right, right) }
        : { left, right }
    )
  }
  return edges
}

/**
 * Layers as SVG with their text set as the canvas sets it: the fonts it draws with loaded, each
 * line on the baseline the canvas gives it, and wrapped paragraphs kept wrapped.
 */
export async function renderNodesToLaidOutSVG(
  graph: SceneGraph,
  pageId: string,
  nodeIds: string[],
  options: SVGExportOptions = {}
): Promise<string | null> {
  await prepareGraphFonts(graph, nodeIds)
  return withTextLayout(async (textLayout) =>
    renderNodesToSVG(graph, pageId, nodeIds, { textLayout, ...options })
  )
}
