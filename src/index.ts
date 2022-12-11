import type { Config } from "./types/config";

type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number] : Enumerate<N, [...Acc, Acc['length']]>

type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>

export const defineSolution = <K extends true | false = false>(
  fn: (input: K extends false ? string : string[], solve: (output: string | number) => void, config: Config) => any,
  config?: { lines: K, example?: boolean, year?: number, day?: IntRange<1, 26>, part?: 1 | 2 }
): [ReturnType<typeof fn>, object] => {
  return [fn, config ?? {}];
}
