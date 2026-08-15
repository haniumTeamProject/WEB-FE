import { describe, expect, it } from 'vitest'
import { findShortestPath } from './pathfind'
import type { PathEdge, PathNode } from './pathNodes'

function node(id: string, x: number, y: number): PathNode {
  return { id, x, y, type: 'corner', concave: false }
}

describe('findShortestPath', () => {
  it('finds the direct path along wall edges when no crossing is involved', () => {
    // A - B - C, 일직선 위 3개 노드
    const nodes = [node('A', 0, 0), node('B', 10, 0), node('C', 20, 0)]
    const edges: PathEdge[] = [
      { a: 'A', b: 'B', type: 'wall' },
      { a: 'B', b: 'C', type: 'wall' },
    ]
    const result = findShortestPath(nodes, edges, 'A', 'C', 0)
    expect(result).not.toBeNull()
    expect(result!.path).toEqual(['A', 'B', 'C'])
    expect(result!.distancePx).toBeCloseTo(20)
  })

  it('takes a cross edge when it saves more than the penalty', () => {
    // 우회로(wall, 합 200)보다 건너기(cross, 직선 5 + 페널티 0)가 훨씬 짧다
    const nodes = [node('A', 0, 0), node('M', 0, 100), node('B', 5, 0)]
    const edges: PathEdge[] = [
      { a: 'A', b: 'M', type: 'wall' }, // 100
      { a: 'M', b: 'B', type: 'wall' }, // 100
      { a: 'A', b: 'B', type: 'cross' }, // 5
    ]
    const result = findShortestPath(nodes, edges, 'A', 'B', 0)
    expect(result!.path).toEqual(['A', 'B'])
    expect(result!.distancePx).toBeCloseTo(5)
  })

  it('avoids a cross edge when the penalty outweighs the distance saved', () => {
    // 직선 우회로(20)가 건너기(5) + 큰 페널티(50)보다 짧으면 우회로를 택해야 한다
    const nodes = [node('A', 0, 0), node('M', 10, 0), node('B', 20, 0)]
    const edges: PathEdge[] = [
      { a: 'A', b: 'M', type: 'wall' }, // 10
      { a: 'M', b: 'B', type: 'wall' }, // 10 (합 20)
      { a: 'A', b: 'B', type: 'cross' }, // 20 (직선), + 페널티
    ]
    const result = findShortestPath(nodes, edges, 'A', 'B', 50)
    expect(result!.path).toEqual(['A', 'M', 'B'])
    expect(result!.distancePx).toBeCloseTo(20)
  })

  it('returns null when start and end are disconnected', () => {
    const nodes = [node('A', 0, 0), node('B', 10, 0)]
    const result = findShortestPath(nodes, [], 'A', 'B', 0)
    expect(result).toBeNull()
  })

  it('returns a zero-length path when start equals end', () => {
    const nodes = [node('A', 0, 0)]
    const result = findShortestPath(nodes, [], 'A', 'A', 0)
    expect(result).toEqual({ path: ['A'], distancePx: 0 })
  })
})
