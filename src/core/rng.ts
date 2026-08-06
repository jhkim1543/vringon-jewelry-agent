// 결정적 의사난수 · 같은 시드면 같은 Run 결과 (체크포인트 재개 시 중복 0건 원칙)
export function makeRng(seed: number) {
  let s = seed >>> 0
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0x100000000
    },
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1))
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)]
    },
    chance(p: number): boolean { return this.next() < p },
  }
}
export type Rng = ReturnType<typeof makeRng>
