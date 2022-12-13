export interface Config {
  year: number;
  day: number;
  part: number;
  example: boolean;
  /** @deprecated use 'mode' instead */
  lines: boolean;
  mode: 'text' | 'lines' | 'numbers';
  input: string | null;
}
