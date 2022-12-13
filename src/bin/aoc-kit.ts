#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import { URLSearchParams } from 'url';
import axios from 'axios';
import process from "process";
import path from "path";
import cheerio from 'cheerio';
import pc from 'picocolors';
import { Config } from '../types/config';

interface Submission {
  value: string;
  solved: boolean;
}

const cacheDir = path.join(os.homedir(), '.aockit');
const submission: Submission = { value: '', solved: false };

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const [emX, emTick, emArr, emStar] = [
  pc.bold(pc.red('X')),
  pc.bold(pc.green('√')),
  pc.bold(pc.blue('►')),
  pc.bold(pc.yellow('✶'))
];

const [,, cmd, ...args] = process.argv;
(async () => {
  try {
    if (!cmd) throw Error('No command specified');
    switch (cmd) {
      case 'run':
      case 'submit':
        await execute();
        break;
      case 'login':
        await login();
        break;
      case 'logout':
        logout();
        break;
      case 'clear':
        clearAll();
        break;
      default:
        throw Error(`Unknown command '${cmd}'`);
    }
  } catch (e) {
    console.error(emX, `${e.message}`);
    if (e.cause) throw e.cause;
  }
})();

function logout() {
  const sessPath = path.join(cacheDir, 'session');
  if (!fs.existsSync(sessPath))
    throw Error("You don't seem to be logged in");

  try {
    fs.unlinkSync(sessPath);
  } catch {
    throw Error('Unable to remove your session token');
  }

  clearCache();
  console.log(emTick, 'User successfully logged out');
}

function clearAll() {
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log(emTick, 'All aoc-kit data cleared');
  } catch {
    throw Error('Unable to clear the cache');
  }
}

async function login() {
  if (!args[0] || args[0].length !== 128)
    throw Error('Invalid session token');

  try {
    await axios({
      method: 'HEAD',
      url: 'https://adventofcode.com/2022/day/1/input',
      headers: {
        cookie: `session=${args[0]}`
      }
    });
  } catch {
    throw Error('Token validation failed');
  }


  try {
    const configPath = path.join(cacheDir, 'session');
    fs.writeFileSync(configPath, args[0], 'utf-8');
  } catch {
    throw Error('Unable to save user configuration');
  }

  clearCache();
  console.log(emTick, 'User successfully logged in');
}

async function execute() {
  let srcFile = args.at(-1);
  let config: Config = {
    year: -1,
    day: -1,
    part: -1,
    input: '',
    mode: 'text',
    lines: false,
    example: false
  };

  if (!srcFile)
    throw Error('No solution module specified')

  if (!path.isAbsolute(srcFile))
    srcFile = path.join(process.cwd(), srcFile);

  if (!fs.existsSync(srcFile))
    throw Error(`Unable to find file '${srcFile}'`)

  let module, solution, srcConfig = {};
  try {
    module = (await import(`file://${srcFile}`)).default;
  } catch {
    throw Error('Module import failed');
  }

  if (
    Array.isArray(module) && module.length === 2 &&
    typeof module[0] === 'function' && typeof module[1] === 'object'
  ) {
    [solution, srcConfig] = module;
  } else if (typeof module === 'function') {
    solution = module;
  } else {
    throw Error('Invalid default export of the module');
  }

  mergeObjInto(srcConfig, config);
  for (let i = 0; i < args.length - 1; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        config.input = args[++i];
        break;
      case '--year':
      case '-y':
        config.year = parseNumericArg(args[i], args[++i]);
        break;
      case '--day':
      case '-d':
        config.day = parseNumericArg(args[i], args[++i]);
        break;
      case '--part':
      case '-p':
        config.part = parseNumericArg(args[i], args[++i]);
        break;
      case '--example':
      case '-e':
        config.example = true;
        break;
      default:
        throw Error(`Unknown flag '${args[i]}'`);
    }
  }

  if (cmd === 'submit') {
    if (config.input)
      throw Error('You cannot submit your answer while using a custom input file');

    if (config.example)
      throw Error('You cannot submit your answer while using the example input');
  }

  if (config.input!.length < 1) {
    if (config.day === -1)
      throw Error('Day has not been specified');

    if (config.day < 1 || config.day > 25)
      throw Error(`Day ${config.day} is invalid`);

    if (config.part === -1)
      throw Error('Part has not been specified');

    if (config.part < 1 || config.part > 2)
      throw Error(`Part ${config.part} is invalid`);

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const year = now.getFullYear();
    const latestYear = now.getMonth() < 11 ? year - 1 : year;
    if (config.year === -1) config.year = latestYear;

    if (config.year < 2015 || config.year > latestYear)
      throw Error(`Year ${config.year} is not valid`);
  }

  if (!Object.hasOwn(srcConfig, 'mode') && config.lines) {
    config.mode = 'lines';
  }

  if (
    config.mode !== 'lines' &&
    config.mode !== 'numbers' &&
    config.mode !== 'text'
  ) throw Error(`Unknown value '${config.mode}' of property 'mode'`);

  let input: string;
  if (cmd === 'submit') {
    input = await fetchInput(config);
  } else {
    input = config.input ?
      loadCustom(config) :
      config.example ?
        await fetchExample(config) :
        await fetchInput(config);
  }

  input = input.trim();
  console.log(emTick, 'Solution module loaded');

  try {
    if (config.input?.length === 0) config.input = null;

    let processed: any = input;
    config.lines = false;

    if (config.mode !== 'text') {
      processed = input.split('\n');
      config.lines = true;

      if (config.mode === 'numbers')
        processed = processed.map((x: string) => Number(x));
    }

    await solution(processed, solve, config);
  } catch (err) {
    throw Error('An error occured within your module:', { cause: err });
  }

  if (!submission.solved)
    throw Error(`Your module has to call the ${pc.magenta(pc.bold('solve()'))} method`);

  console.log(emArr, `Your answer: ${submission.value}`);
  if (cmd === 'submit') await submit(config);
}

async function submit(config: Config) {
  console.log('------------------------------------------');
  const token = getSessionToken();
  const params = new URLSearchParams({
    level: config.part.toString(),
    answer: submission.value
  });

  let $: ReturnType<typeof cheerio.load>;
  try {
    const { data } = await axios({
      method: 'POST',
      url: `https://adventofcode.com/${config.year}/day/${config.day}/answer`,
      headers: { cookie: `session=${token}` },
      data: params.toString()
    });

    $ = cheerio.load(data);
  } catch {
    throw Error('Answer submission failed');
  }

  const resp = $('main > article > p').first().text().trim().toLowerCase();
  if (resp.includes('one gold star closer')) {
    console.log(emTick, 'Answer successfully submitted');
    console.log(emTick, 'Your answer was CORRECT\n');
    console.log(emStar, `DAY ${config.day} (Part ${config.part}) OF ${config.year} COMPLETED`, emStar);
  } else if (resp.includes('already complete it')) {
    console.log(emX, "Either you have already completed this task or you haven't unlocked it yet");
  } else if (resp.includes('too low')) {
    console.log(emTick, 'Answer successfully submitted');
    console.log(emX, 'Your answer was INCORRECT (too low)');
  } else if (resp.includes('too high')) {
    console.log(emTick, 'Answer successfully submitted');
    console.log(emX, 'Your answer was INCORRECT (too high)');
  } else if (resp.includes('not the right answer')) {
    console.log(emTick, 'Answer successfully submitted');
    console.log(emX, 'Your answer was INCORRECT');
  } else if (resp.includes('answer too recently')) {
    console.log(emX, 'You submitted an answer too recently');

    const secs = Number((resp.match(/you have ([0-9]+)s left/i) ?? [])[1]);
    if (!Number.isNaN(secs)) console.log(`(Wait ${secs}s before resubmitting)`);
  } else {
    console.error(emX, "Unable to parse the server's response");
  }
}

function loadCustom(config: Config): string {
  let inputPath = config.input!;
  if (!path.isAbsolute(inputPath))
    inputPath = path.join(process.cwd(), inputPath);

  if (!fs.existsSync(inputPath))
    throw Error(`Input file '${config.input}' doesn't exist`);

  let data: string;
  try {
    data = fs.readFileSync(inputPath, 'utf8');
  } catch {
    throw Error(`Unable to read file '${config.input}'`);
  }

  console.log(emTick, `Input (custom) loaded from file '${config.input}'`);
  return data;
}

async function fetchExample(config: Config): Promise<string> {
  const cached = checkCache(config);
  if (cached) {
    console.log(emTick, 'Input (example) loaded from cache');
    return cached;
  }

  let $: ReturnType<typeof cheerio.load>;
  try {
    const { data } = await axios(`https://adventofcode.com/${config.year}/day/${config.day}`);
    $ = cheerio.load(data);
  } catch {
    throw Error(`Unable to load example for day ${config.day} of ${config.year}`);
  }

  const codeEl = $('pre > code').filter((_, el) => {
    const p = $(el).parent().prev().first();
    return p.is('p') && p.text().toLowerCase().includes('for example');
  });

  if (codeEl.length !== 1)
    throw Error('Unable to locate example input on the page');

  const example = codeEl.first().text().trim();
  cache(example, config);

  console.log(emTick, 'Input (example) fetched from network');
  return example;
}

async function fetchInput(config: Config): Promise<string> {
  const cached = checkCache(config);
  if (cached) {
    console.log(emTick, 'Input loaded from cache');
    return cached;
  }

  const token = getSessionToken();
  try {
    const { data } = await axios({
      url: `https://adventofcode.com/${config.year}/day/${config.day}/input`,
      headers: { cookie: `session=${token}` },
      responseType: 'text'
    });

    cache(data, config);
    console.log(emTick, 'Input fetched from network');
    return data;
  } catch {
    throw Error(`Unable to load input for day ${config.day} of ${config.year}`);
  }
}

function getCacheName(config: Config) {
  const { year, day, example} = config;
  return path.join(cacheDir, `${year}-${day}${example ? 'e' : ''}`);
}

function checkCache(config: Config): string | null {
  const filename = getCacheName(config);
  if (!fs.existsSync(filename)) return null;
  return fs.readFileSync(filename, 'utf8');
}

function cache(data: string, config: Config) {
  const filename = getCacheName(config);
  fs.writeFileSync(filename, data, 'utf8');
}

function clearCache() {
  const files = fs.readdirSync(cacheDir);
  for (const file of files) {
    if (file !== 'session' && !file.endsWith('e')) {
      fs.unlinkSync(path.join(cacheDir, file));
    }
  }
}

function solve(output: string | number) {
  if (typeof output === 'number')
    output = `${output}`;

  if (typeof output !== 'string')
    throw Error(`Output of type '${typeof output}' is not a valid answer`);

  if (submission.solved)
    throw Error('Cannot call the solve() method multiple times');

  submission.value = output;
  submission.solved = true;
}

function getSessionToken() {

  let token: string | null = null;
  const configPath = path.join(cacheDir, 'session');

  if (fs.existsSync(configPath)) {
    try {
      token = fs.readFileSync(configPath, 'utf-8');
    } catch {}
  }

  if (token === null)
    throw Error(`You don't seem to be logged in\n(Run 'aoc-kit login [session_token]' to log in)`);

  return token;
}

function mergeObjInto(src: any, dest: any) {
  for (const key of Object.keys(dest)) {
    if (typeof src[key] === 'undefined') continue;
    if (typeof src[key] === typeof dest[key]) {
      dest[key] = src[key];
    } else {
      throw Error(`Invalid value of property '${key}': ${src[key]}`);
    }
  }
}

function parseNumericArg(flag: string, arg: string | undefined): number {
  const num = Number(arg);
  if (Number.isNaN(num))
    throw Error(`Invalid argument value for flag '${flag}'`);

  return num;
}
