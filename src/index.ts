export const defineSolution = <K extends true | false = false>(
  fn: (input: K extends false ? string : string[], solve: (output: string) => void) => any,
  config?: { lines: K, example?: boolean, year?: number, day?: number, part?: number }
): [ReturnType<typeof fn>, object] => {
  return [fn, config ?? {}];
}
