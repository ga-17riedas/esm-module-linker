'use strict';

// Source modules are a second front end for the linker.  The starter only
// recognizes the simplest declaration; comments, lists, forwarding forms and
// namespaces are intentionally left for the implementation.
function parseSource(source, field) {
  if (typeof source !== 'string') throw new TypeError(field + ' must be a string');
  const entries = [];
  const local = /^\s*export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let match;
  while ((match = local.exec(source)) !== null) {
    entries.push({ type: 'local', name: match[1], local: match[1] });
  }
  return entries;
}

module.exports = { parseSource };
