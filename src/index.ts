import type { Config } from "./types/config";

type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number] : Enumerate<N, [...Acc, Acc['length']]>;

type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export const defineSolution = <T extends true | false = false, U extends 'text' | 'lines' | 'numbers' | undefined = undefined>(
  fn: (
    input: U extends 'numbers' ? number[] :
      U extends 'lines' ? string[] :
        U extends 'text' ? string :
          T extends false ? string : string[],
    solve: (output: string | number) => void,
    config: Config
  ) => any,
  config?: {
    example?: boolean;
    year?: number;
    day?: IntRange<1, 26>;
    part?: 1 | 2;
  } & ({
    /** @deprecated use 'mode' instead */
    lines?: T;
    mode?: never;
  } | {
    /** @deprecated use 'mode' instead */
    lines?: never;
    mode?: U;
  })
): [ReturnType<typeof fn>, object] => {
  return [fn, config ?? {}];
}
