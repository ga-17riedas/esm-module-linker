'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { linkModules } = require('./linker');

function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write('Usage: node src/cli.js <graph.json>\n');
    process.exitCode = 2;
    return;
  }

  const filename = path.resolve(argv[0]);
  const graph = JSON.parse(fs.readFileSync(filename, 'utf8'));
  process.stdout.write(JSON.stringify(linkModules(graph), null, 2) + '\n');
}

main(process.argv.slice(2));
