#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import process from "process";
import path from "path";
import cheerio from 'cheerio';

interface Config {
  year: number;
  day: number;
  part: number;
  example: boolean;
  lines: boolean;
  input: string;
}

const cacheDir = path.join(os.homedir(), '.aocli');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const [,, cmd, ...args] = process.argv;
(async () => {
  try {
    if (!cmd) throw new Error('No command specified');
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
        throw new Error(`Unknown command '${cmd}'`);
    }
  } catch (e) {
    console.error(`❌  ${e.message}`);
  }
})();

function logout() {
  const sessPath = path.join(cacheDir, 'session');
  if (!fs.existsSync(sessPath))
    throw new Error("You don't seem to be logged in");

  try {
    fs.unlinkSync(sessPath);
  } catch {
    throw new Error('Unable to remove your session token');
  }

  clearCache();
  console.log('✔️  User successfully logged out');
}

function clearAll() {
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('✔️  All aocli data cleared');
  } catch {
    throw new Error('Unable to clear the cache');
  }
}

async function login() {
  if (!args[0] || args[0].length !== 128)
    throw new Error('Invalid session token');

  try {
    await axios({
      method: 'HEAD',
      url: 'https://adventofcode.com/2022/day/1/input',
      headers: {
        cookie: `session=${args[0]}`
      }
    });
  } catch {
    throw new Error('Token validation failed');
  }


  try {
    const configPath = path.join(cacheDir, 'session');
    console.log(configPath);
    fs.writeFileSync(configPath, args[0], 'utf-8');
  } catch {
    throw new Error('Unable to save user configuration');
  }

  clearCache();
  console.log('✔️  User successfully logged in');
}

async function execute() {
  let config: Config = { year: -1, day: -1, part: -1, input: '', lines: false, example: false };
  let srcFile = args.at(-1);

  if (!srcFile)
    throw new Error('No solution module specified')

  if (!path.isAbsolute(srcFile))
    srcFile = path.join(process.cwd(), srcFile);

  if (!fs.existsSync(srcFile))
    throw new Error(`Unable to find file '${srcFile}'`)

  let module, solution, srcConfig = {};
  try {
    module = (await import(`file://${srcFile}`)).default;
  } catch (err) {
    throw new Error('Module import failed');
  }

  if (
    Array.isArray(module) && module.length === 2 &&
    typeof module[0] === 'function' && typeof module[1] === 'object'
  ) {
    [solution, srcConfig] = module;
  } else if (typeof module === 'function') {
    solution = module;
  } else {
    throw new Error('Invalid default export of the module');
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
        throw new Error(`Unknown flag '${args[i]}'`);
    }
  }

  if (config.day === -1)
    throw new Error('Day has not been specified');

  if (config.part === -1)
    throw new Error('Part has not been specified');

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const year = now.getFullYear();
  const latestYear = now.getMonth() < 11 ? year - 1 : year;
  if (config.year === -1) config.year = latestYear;

  if (config.year < 2015 || config.year > latestYear)
    throw new Error(`Year ${config.year} is not valid`);

  let input: string | string[];
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
  if (config.lines) input = input.split('\n');
  await solution(input, solve);
}

function loadCustom(config: Config): string {
  let inputPath = config.input;
  if (!path.isAbsolute(inputPath))
    inputPath = path.join(process.cwd(), inputPath);

  if (!fs.existsSync(inputPath))
    throw new Error(`Unable to load input file '${config.input}'`);

  return fs.readFileSync(inputPath, 'utf8');
}

async function fetchExample(config: Config): Promise<string> {
  const cached = checkCache(config);
  if (cached) return cached;

  let $: ReturnType<typeof cheerio.load>;
  try {
    const { data } = await axios(`https://adventofcode.com/${config.year}/day/${config.day}`);
    $ = cheerio.load(data);
  } catch {
    throw new Error(`Unable to load example for day ${config.day} in ${config.year}`);
  }

  const codeEl = $('pre > code').filter((_, el) => {
    const p = $(el).parent().prev().first();
    return p.is('p') && p.text().toLowerCase().includes('for example');
  });

  if (codeEl.length !== 1)
    throw new Error('Unable to locate example input on the page');

  const example = codeEl.first().text().trim();
  cache(example, config);

  return example;
}

async function fetchInput(config: Config): Promise<string> {
  const cached = checkCache(config);
  if (cached) return cached;

  const token = getSessionToken();
  try {
    const { data } = await axios({
      url: `https://adventofcode.com/${config.year}/day/${config.day}/input`,
      headers: { cookie: `session=${token}` },
      responseType: 'text'
    });

    cache(data, config);
    return data;
  } catch {
    throw new Error('Unable to fetch your task input');
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

function solve(output: string) {

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
    throw new Error(`You don't seem to be logged in\nRun 'aocli login [session_token]' to log in`);

  return token;
}

function mergeObjInto(src: any, dest: any) {
  for (const key of Object.keys(dest)) {
    if (typeof src[key] === 'undefined') continue;
    if (typeof src[key] === typeof dest[key]) {
      dest[key] = src[key];
    } else {
      throw new Error(`Invalid value of property '${key}': ${src[key]}`);
    }
  }
}

function parseNumericArg(flag: string, arg: string | undefined): number {
  const num = Number(arg);
  if (Number.isNaN(num))
    throw new Error(`Invalid argument value for flag '${flag}'`);

  return num;
}
