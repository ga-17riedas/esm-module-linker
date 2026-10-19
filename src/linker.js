'use strict';

const posix = require('node:path').posix;
const { parseSource } = require('./source-parser');

function canonicalId(value) {
  const normalized = posix.normalize(value.replaceAll('\\', '/'));
  return normalized.startsWith('/') ? normalized : '/' + normalized;
}

function resolveTarget(moduleIds, importer, specifier) {
  const clean = specifier.replaceAll('\\', '/');
  const base = clean.startsWith('.')
    ? posix.join(posix.dirname(importer), clean)
    : clean;
  const exact = canonicalId(base);
  const candidates = [exact, exact + '.js', posix.join(exact, 'index.js')];
  return candidates.find((candidate) => moduleIds.has(candidate)) || null;
}

function linkModules(graph) {
  if (!graph || !Array.isArray(graph.modules)) {
    throw new TypeError('graph.modules must be an array');
  }

  const records = new Map();
  const diagnostics = [];

  for (const descriptor of graph.modules) {
    if (!descriptor || typeof descriptor.id !== 'string') {
      throw new TypeError('module.id must be a string');
    }
    const hasExports = Object.prototype.hasOwnProperty.call(descriptor, 'exports');
    const hasSource = Object.prototype.hasOwnProperty.call(descriptor, 'source');
    if (hasExports === hasSource) {
      throw new TypeError('module must provide exactly one of exports or source');
    }
    if (hasExports && !Array.isArray(descriptor.exports)) {
      throw new TypeError('module.exports must be an array');
    }
    if (hasSource && typeof descriptor.source !== 'string') {
      throw new TypeError('module.source must be a string');
    }

    const id = canonicalId(descriptor.id);
    if (records.has(id)) {
      diagnostics.push({
        code: 'DUPLICATE_MODULE',
        module: id,
        message: 'Duplicate module ' + id
      });
      continue;
    }
    records.set(id, hasSource ? parseSource(descriptor.source, 'module.source') : descriptor.exports);
  }

  const moduleIds = new Set(records.keys());
  const modules = {};

  // This starter implementation deliberately supports only local and namespace
  // exports. Named chains, star propagation, ambiguity, full validation, and
  // deterministic diagnostic handling are left for the task.
  for (const id of [...records.keys()].sort()) {
    const resolved = {};
    const explicit = new Set();

    for (const entry of records.get(id)) {
      if (!entry || typeof entry.type !== 'string') {
        throw new TypeError('export.type must be a string');
      }

      if (entry.type === 'local') {
        if (explicit.has(entry.name)) {
          diagnostics.push({
            code: 'DUPLICATE_EXPORT',
            module: id,
            name: entry.name,
            message: 'Duplicate explicit export ' + entry.name
          });
          continue;
        }
        explicit.add(entry.name);
        resolved[entry.name] = {
          kind: 'binding',
          module: id,
          local: entry.local
        };
      } else if (entry.type === 'namespace') {
        explicit.add(entry.name);
        const target = resolveTarget(moduleIds, id, entry.from);
        if (target) {
          resolved[entry.name] = { kind: 'namespace', module: target };
        }
      }
    }

    modules[id] = {
      exports: Object.fromEntries(Object.entries(resolved).sort(([a], [b]) => a.localeCompare(b))),
      ambiguous: {}
    };
  }

  return { modules, diagnostics };
}

module.exports = { linkModules };
