# Linker Contract

This document contains the detailed observable contract referenced by
`instruction.md`. The verifier compares JSON values, not object prototypes.

## Input and resolution

The graph is `{modules, packages?, conditions?}`. Every module has a string
`id` and exactly one of `exports` or `source`. Canonical IDs use POSIX `/`, are
absolute, and add a leading `/` to project-relative IDs. A relative specifier
is resolved from the importing module; another specifier is resolved from the
graph root. Candidate IDs are tried in this order: exact, `.js`, `/index.js`.
Do not mutate the input. Invalid fields throw `TypeError` with the dotted
input path in the message.

All lexical comparisons in this contract use JavaScript string code-unit
order (`a < b`), not locale collation. Record names and local labels are
arbitrary strings, including empty strings, punctuation and Unicode.

`packages` contains `{name,root,exports}` maps. A bare specifier consults the
first path segment, or the first two for a scoped package. Resolve `.` or the
requested `./subpath` through the package map and then apply the same three
candidate IDs below `root`. Exact keys beat `*` patterns; patterns are ordered
by descending key length then lexical order. Replace `*` in the target with the
matched subpath. A target is a string, `null` (an explicitly blocked target), or
a condition object whose values are again targets; any other target value (for
example a number, boolean or array) is malformed. Use the first key in
`conditions`, defaulting to `['node','default']`.
An existing package with no matching export is unresolved. Without a matching
package, retain project-root resolution. Duplicate package names and malformed
package maps, including a non-string/non-null/non-object target, are TypeErrors
whose message carries the `graph.packages[i].exports[...]` path of the offending
entry, e.g. `graph.packages[0].exports["."].node`.

Record forms are:

```text
local:     {type,name,local}
named:     {type,name,imported,from}
namespace: {type,name,from}
star:      {type,from}
```

## Source form

`source` is a restricted ESM front end. It must be parsed without evaluation.
Ignore unrelated statements. Accept whitespace, `//` and `/* */` comments,
optional semicolons, single/double quoted specifiers, and these forms:

```text
export const|let|var|function|class name
export default expression
export default function|class [name]
export { local [as name], ... }
export { imported [as name], ... } from "specifier"
export * from "specifier"
export * as name from "specifier"
```

Default exports always have export name `"default"`. Their binding's `local`
is defined as follows: `export default expression` uses the synthetic string
`"default"`, even when the expression is an identifier; anonymous
`export default function() {}` and `export default class {}` also use
`"default"`. A named default function or class uses its declared identifier,
so `export default function named() {}` has `local: "named"` and
`export default class Widget {}` has `local: "Widget"`. Re-exporting any of
these preserves that original module and `local`, including through renames.

Quoted literals and comments are opaque to declaration scanning: their
`export`, braces, brackets and semicolons are text, not syntax. Ignore whole
unrelated statements and balanced bodies, including objects with an `export`
property. Decode quoted specifiers using `\\`, `\'`, `\"`, `\n`, `\r`, `\t`,
`\xHH` and `\uHHHH` escapes; malformed hex escapes are source errors. These
rules do not require support for template literals, regular expressions,
destructuring declarations or additional export productions.

Malformed source, unterminated comments/strings, and incomplete lists throw a
`TypeError` containing the module's `.source` path. Preserve declaration order
for duplicate handling.

## Link result

Return exactly `{modules, diagnostics, cycles}`. Each module is
`{exports, ambiguous}`. A local or resolved named export is
`{kind:"binding",module,local}`. A namespace is
`{kind:"namespace",module}`. Maps must preserve arbitrary own-property names
such as `__proto__`, `constructor`, and `toString`; sort module and export keys
lexically.

Named chains may be arbitrarily deep and cyclic. Explicit local/named/namespace
records shadow same-named stars even when unresolved. Stars omit `default`.
Deduplicate candidates by original binding identity, not traversal path. More
than one distinct candidate makes the name ambiguous; propagate ambiguity
through named renames and stars. Omit ambiguous names from `exports` and sort
their candidates by `kind`, `module`, `local`. Missing explicit names never
fall back to stars. Keep the first canonical duplicate module and first
duplicate explicit name; continue unrelated work.

Diagnostics are deduplicated and sorted by `module,code,name,from,message`;
missing sort fields compare first. An absent field and the empty string are
different values: `name: ""` and a diagnostic without `name` are distinct
entries, both in sorting and in deduplication. Use only:

```text
DUPLICATE_MODULE  later module descriptor; module
DUPLICATE_EXPORT  later explicit name; module,name
MODULE_NOT_FOUND  unresolved edge; module,from and named/namespace name
MISSING_EXPORT    named edge reaches a module without the requested name;
                  module,name,original from
AMBIGUOUS_EXPORT  one module/name has multiple candidates; module,name
```

Every diagnostic has non-empty `code`, `module`, and `message`. Return SCCs of
the resolved named/namespace/star graph (missing edges excluded) when a
component has at least two modules or a self-edge. Sort IDs within components
and components by their ID arrays.

## Export explanations

The session's `explain(moduleId, name)` method returns a deterministic proof for
one export without changing session state. It uses the canonical module ID and
returns `{ok:true,op:"explain",revision,module,name,result}` where `result` is
`{status,candidates,proofs}`. `status` is `resolved` for one candidate,
`ambiguous` for more than one, and `missing` for none. `candidates` uses the
same candidate objects and ordering as the link result. `proofs` has one entry
per candidate in that order, each `{candidate,path}`.

Each `path` is a finite sequence of steps from the queried export toward its
original binding. A local step is
`{module,name,via:"local",local}`; a named step adds
`{via:"named",from,imported,target}`; a namespace step adds
`{via:"namespace",from,target}`; and a star step adds
`{via:"star",from,target}`. `target` is the canonical resolved module ID.
The final step is always local or namespace. For each candidate choose a path
with the fewest steps; ties compare the JSON representation of the ordered
steps lexically. Candidate identity is still the original binding identity, so
different diamond paths share one proof entry while distinct bindings retain
separate entries. Cycles must terminate and must not repeat a step once a
shorter proof is available. A missing explanation has empty candidates and
proofs.

For proof tie-breaking, serialize each step's fields in the following order:
`module,name,via`, then `local` for local steps, `from,imported,target` for
named steps, or `from,target` for namespace/star steps. Comparing proofs must
work on deep paths as well as cyclic graphs. A committed update can remove
all support for a candidate in a cycle; explanations must reflect the new
graph, including changed shortest paths and ambiguity becoming resolved or
missing.

## Session and CLI

Export `createLinker` beside `linkModules`. Its empty session exposes
`load(graph)`, `query(moduleId)`, `explain(moduleId,name)`, `replace(moduleId,module,baseRevision?)`,
`remove(moduleId,baseRevision?)`, `patch(operations,baseRevision?)`, and
`snapshot()`. Successful first load is revision 1; successful updates increment
once. Updates link a temporary graph before commit. Failed validation, unknown
modules, conflicts, or patches leave graph/result/revision unchanged.
Snapshots are defensive copies. Query and update responses use canonical IDs;
successful API and JSONL responses use the same committed results and revisions.
Direct session failures may throw an `Error` with a non-empty message or return
the JSONL error envelope below. A thrown error needs no custom `code` property;
invalid graph/source fields still throw `TypeError`. A patch requires a
non-empty operations array in both the direct API and JSONL interface.

The graph passed to load/replace/patch and the nested data returned by load,
query, explain, updates and snapshot are isolated from subsequent caller
mutation. A failed operation preserves explanations as well as link results
and revision.

JSONL requests use these shapes: `load` has `graph`; `query` and `explain`
have `module`, with `explain` also requiring `name`;
`replace` has `id,module`; `remove` has `id`; `patch` has a non-empty ordered
`operations` array of `{type:"replace",id,module}` or `{type:"remove",id}`.
Each update may carry a positive `baseRevision`, which must match the current
revision. Successful load/update responses contain `{ok:true,op,revision,result}`
and replace/remove also contain canonical `module`; query returns
`{ok:true,op:"query",revision,module,result:<module>}`. Errors contain
`{ok:false,op?,error:{code,message}}`; malformed JSON and bad requests must
produce one error line and keep the process alive. Empty input lines are
ignored. A failed load/update/patch, conflict, unknown module, or pre-load
operation leaves state unchanged.

The one-shot CLI supports complete output, `--module`, `--diagnostics`, stdin
`-`, and `--pretty`. Complete output prints the whole link result
`{modules, diagnostics, cycles}`. `--module <id>` prints **only that module's
record** (`{exports, ambiguous}`) with no wrapping envelope, and `--diagnostics`
prints **only the diagnostics array** with no wrapping envelope. Bad options and
unknown modules fail with non-empty stderr.
`--serve` accepts one JSON request per non-empty line for `load`, `query`, `explain`,
`replace`, `remove`, and non-empty atomic `patch`; every line gets one response
and malformed input does not terminate the process. `--watch file` emits an
initial result and later results after changes, reports bad files without
discarding the last valid state, and recovers after repair.

`src/linker.js` and `src/source-parser.js` are library modules: they must never
terminate the process (`process.exit`, `process.abort`, `process.reallyExit` and
equivalents are out of contract). The verifier grades the complete test summary
and treats a termination call in those files as a failed run.

Keep results deterministic and practical for deep chains, reverse declaration
order, cycles, diamonds, ambiguity, duplicates, prototype-colliding names,
large graphs, repeated calls, and graph permutations.
