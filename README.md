# esm-module-linker

Loader-side helper that computes the public export namespace of an ES module
graph. It accepts a JSON graph of modules with export records, resolves every
export to the binding or namespace it refers to, reports the graph problems it
finds, and can be used either as a one-shot call or as a stateful session for
incremental compiler workflows.

## Layout

    src/linker.js         linkModules(graph) and the createLinker() session
    src/source-parser.js  restricted ESM `source` front end
    src/cli.js            one-shot, JSONL session, and file-watch front end
    docs/contract.md      the observable contract the linker must satisfy
    fixtures/example.json sample record graph
    fixtures/source-graph.json sample graph with `source` modules

## Commands

    node src/cli.js fixtures/example.json
    node src/cli.js --serve
    node src/cli.js --watch fixtures/example.json

The project runs on the Node.js standard library alone: no build step, no
third-party dependency, no lockfile.

## Status

`src/linker.js` and `src/source-parser.js` implement a subset of the contract
and are being completed. `docs/contract.md` is the reference for the required
observable behaviour; `src/cli.js` already forwards to both front ends and must
keep its output shape.

## License

MIT - see `LICENSE`.