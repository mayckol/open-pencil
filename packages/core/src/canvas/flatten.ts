import { omit } from 'es-toolkit/object'

import type { Fill, SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import { copyFills } from '@open-pencil/scene-graph/copy'
import { parseSVGPath } from '@open-pencil/scene-graph/parse-path'

import { makeBooleanSourcePath, makeStrokeOutlinePath, nodePathTransform } from './boolean'
import type { SkiaRenderer } from './renderer'

export type VectorFlattenProps = Pick<
  SceneNode,
  'name' | 'x' | 'y' | 'width' | 'height' | 'fills' | 'vectorNetwork'
>

type NodePathFactory = (
  renderer: SkiaRenderer,
  graph: SceneGraph,
  node: SceneNode
) => ReturnType<typeof makeBooleanSourcePath>

function nodesToVectorProps(
  renderer: SkiaRenderer,
  graph: SceneGraph,
  nodes: SceneNode[],
  makeNodePath: NodePathFactory,
  paintOf: (node: SceneNode) => Fill[] = (node) => node.fills
): VectorFlattenProps | null {
  const path = new renderer.ck.PathBuilder()
  for (const node of nodes) {
    const nodePath = makeNodePath(renderer, graph, node)
    if (!nodePath) {
      path.delete()
      return null
    }
    path.addPath(nodePath, nodePathTransform(renderer, node))
    nodePath.delete()
  }

  const bounds = path.getBounds()
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
    path.delete()
    return null
  }

  path.transform(renderer.ck.Matrix.translated(-bounds[0], -bounds[1]))
  const immutablePath = path.detachAndDelete()
  const vectorNetwork = parseSVGPath(immutablePath.toSVGString())
  immutablePath.delete()

  return {
    name: 'Flatten',
    x: bounds[0],
    y: bounds[1],
    width: bounds[2] - bounds[0],
    height: bounds[3] - bounds[1],
    fills: copyFills(paintOf(nodes[0])),
    vectorNetwork
  }
}

export function flattenNodesToVectorProps(
  renderer: SkiaRenderer,
  graph: SceneGraph,
  nodes: SceneNode[]
): VectorFlattenProps | null {
  return nodesToVectorProps(renderer, graph, nodes, (r, g, node) =>
    makeBooleanSourcePath(r, node, g)
  )
}

/** A layer's strokes as the fills of its outline, which paints what the strokes painted. */
function strokePaints(node: SceneNode): Fill[] {
  return node.strokes.map((stroke) =>
    omit(stroke, ['weight', 'align', 'cap', 'join', 'dashPattern'])
  )
}

/** Strokes as filled outlines, painted with the strokes and shaped as the canvas draws them. */
export function outlineStrokeNodesToVectorProps(
  renderer: SkiaRenderer,
  graph: SceneGraph,
  nodes: SceneNode[]
): VectorFlattenProps | null {
  return nodesToVectorProps(
    renderer,
    graph,
    nodes,
    (r, g, node) => makeStrokeOutlinePath(r, node, g),
    strokePaints
  )
}
