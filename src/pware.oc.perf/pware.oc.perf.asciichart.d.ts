declare module "asciichart" {
  export function plot(
    series: number[] | number[][],
    config?: {
      min?: number
      max?: number
      offset?: number
      padding?: string
      height?: number
      colors?: string[]
      symbols?: string[]
      format?: (x: number, i: number) => string
    },
  ): string
}
