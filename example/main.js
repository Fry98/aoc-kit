import { defineSolution } from '../dist/index.js';

export default defineSolution((input, solve, config) => {
  solve(input.join(' '));
}, { mode: 'lines' });
