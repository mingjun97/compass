'use strict';
const childProcess = require('child_process');
const path = require('path');
const { promises: fs } = require('fs');
const os = require('os');
const { glob } = require('glob');
const { promisify } = require('util');
const execFile = promisify(childProcess.execFile);

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function snykTest(cwd) {
  const tmpPath = path.join(os.tmpdir(), 'tempfile-' + Date.now());

  let execErr;

  try {
    if (!(await fileExists(path.join(cwd, `package.json`)))) {
      return;
    }

    console.info(`testing ${cwd} ...`);
    await fs.mkdir(path.join(cwd, `node_modules`), { recursive: true });

    try {
      await execFile(
        'npx',
        [
          'snyk@latest',
          'test',
          '--all-projects',
          '--severity-threshold=low',
          '--dev',
          `--json-file-output=${tmpPath}`,
        ],
        {
          cwd,
          maxBuffer: 50 /* MB */ * 1024 * 1024, // default is 1 MB
        }
      );
    } catch (err) {
      execErr = err;
    }

    const res = JSON.parse(await fs.readFile(tmpPath));
    console.info(`testing ${cwd} done.`);
    return res;
  } catch (err) {
    console.error(`Snyk failed to create a json report for ${cwd}:`, execErr);
    throw new Error(`Testing ${cwd} failed.`);
  } finally {
    try {
      await fs.rm(tmpPath);
    } catch (error) {
      //
    }
  }
}

async function main() {
  const rootPath = path.resolve(__dirname, '..');

  const { workspaces } = JSON.parse(
    await fs.readFile(path.join(rootPath, 'package.json'))
  );

  const packages = (await Promise.all(workspaces.map((w) => glob(w)))).flat();

  const results = [];

  results.push(await snykTest(rootPath));

  for (const location of packages) {
    const result = await snykTest(location);
    if (result) {
      results.push(result);
    }
  }

  await fs.mkdir(path.join(rootPath, `.sbom`), { recursive: true });

  await fs.writeFile(
    path.join(rootPath, `.sbom/snyk-test-result.json`),
    JSON.stringify(results.flat(), null, 2)
  );

  await execFile(
    'npx',
    [
      'snyk-to-html',
      '-i',
      path.join(rootPath, '.sbom/snyk-test-result.json'),
      '-o',
      path.join(rootPath, `.sbom/snyk-test-result.html`),
    ],
    { cwd: rootPath }
  );
}

main();
