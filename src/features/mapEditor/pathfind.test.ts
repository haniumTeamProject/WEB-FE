import { describe, expect, it } from 'vitest'
import { findShortestPath, isCrossEdgeUsable } from './pathfind'
import type { PathEdge, PathNode } from './pathNodes'

function node(id: string, x: number, y: number): PathNode {
  return { id, x, y, type: 'corner', concave: false }
}

function landmarkNode(id: string, x: number, y: number): PathNode {
  return { id, x, y, type: 'landmark', concave: false }
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

  it('a directed cross edge only works a->b, not b->a (건너기 역방향 금지)', () => {
    // A(벽 끝)에서 B(맞은편)로 건너는 건 되지만, B에는 그 자격이 없으므로 B->A로 되돌아가는 경로는
    // (우회로가 있어도) 건너기를 못 쓰고 무조건 우회로만 타야 한다.
    const nodes = [node('A', 0, 0), node('M', 0, 100), node('B', 5, 0)]
    const edgesForward: PathEdge[] = [
      { a: 'A', b: 'M', type: 'wall' },
      { a: 'M', b: 'B', type: 'wall' },
      { a: 'A', b: 'B', type: 'cross', directed: true },
    ]
    // A->B는 건너기(짧은 직선)를 탈 수 있어야 한다
    const forward = findShortestPath(nodes, edgesForward, 'A', 'B', 0)
    expect(forward!.path).toEqual(['A', 'B'])

    // B->A는 같은 건너기 엣지를 반대로 못 타서, 훨씬 긴 우회로(M을 거침)를 타야 한다
    const backward = findShortestPath(nodes, edgesForward, 'B', 'A', 0)
    expect(backward!.path).toEqual(['B', 'M', 'A'])
  })

  it('목적지가 출발지·도착지가 아니면 그 목적지의 건너기를 지름길로 쓰지 않는다(실제 발견된 문제)', () => {
    // A→B로 가는 길에 목적지 L이 놓여 있다. L에는 훨씬 짧은 지름길(L→F→B, 총 18)이 있지만 L은 이
    // 경로의 출발지도 도착지도 아니므로 그 지름길을 쓰면 안 되고, 먼 우회로(L→M→B)를 타야 한다.
    const nodes = [
      node('A', 0, 0),
      landmarkNode('L', 10, 0),
      node('M', 10, -100),
      node('F', 16, 8),
      node('B', 16, 0),
    ]
    const edges: PathEdge[] = [
      { a: 'A', b: 'L', type: 'wall' }, // 10
      { a: 'L', b: 'M', type: 'wall' }, // 100
      { a: 'M', b: 'B', type: 'wall' }, // hypot(6,100)
      { a: 'L', b: 'F', type: 'cross' }, // 10 — L에 있지 않은 이상 못 씀
      { a: 'F', b: 'B', type: 'wall' }, // 8
    ]
    const result = findShortestPath(nodes, edges, 'A', 'B', 0)
    expect(result!.path).toEqual(['A', 'L', 'M', 'B'])
    expect(result!.distancePx).toBeCloseTo(10 + 100 + Math.hypot(6, 100))
  })

  it('목적지가 이번 경로의 출발지 자신이면 그 목적지의 건너기를 정상적으로 쓴다', () => {
    // 위와 똑같은 그래프에서 L 자신이 출발지면, 지름길(L→F→B, 18)이 정상적으로 선택돼야 한다
    // (우회로 L→M→B는 100 + hypot(6,100) ≈ 200으로 훨씬 김).
    const nodes = [
      node('A', 0, 0),
      landmarkNode('L', 10, 0),
      node('M', 10, -100),
      node('F', 16, 8),
      node('B', 16, 0),
    ]
    const edges: PathEdge[] = [
      { a: 'A', b: 'L', type: 'wall' },
      { a: 'L', b: 'M', type: 'wall' },
      { a: 'M', b: 'B', type: 'wall' },
      { a: 'L', b: 'F', type: 'cross' }, // 10
      { a: 'F', b: 'B', type: 'wall' }, // 8
    ]
    const result = findShortestPath(nodes, edges, 'L', 'B', 0)
    expect(result!.path).toEqual(['L', 'F', 'B'])
    expect(result!.distancePx).toBeCloseTo(18)
  })
})

describe('isCrossEdgeUsable', () => {
  it('목적지(landmark) 노드는 자기 자신이 출발지일 때만 건너기를 쓸 수 있다', () => {
    const landmark = landmarkNode('L', 0, 0)
    expect(isCrossEdgeUsable(landmark, 'L')).toBe(true)
    expect(isCrossEdgeUsable(landmark, 'OTHER')).toBe(false)
  })

  it('코너·연결자 노드는 출발지 여부와 무관하게 항상 건너기를 쓸 수 있다', () => {
    const corner = node('C', 0, 0)
    const connector = { id: 'V', x: 0, y: 0, type: 'connector' as const, concave: false }
    expect(isCrossEdgeUsable(corner, 'OTHER')).toBe(true)
    expect(isCrossEdgeUsable(connector, 'OTHER')).toBe(true)
  })
})
