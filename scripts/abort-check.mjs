// Checks the abort semantics behind cancel/timeout in the background remover.
// Run with `bun scripts/abort-check.mjs`.
import { abortable, runWithConcurrency } from "../src/lib/concurrency.ts";

let failures = 0;
function check(label, pass, detail = "") {
  if (pass) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label} ${detail}`);
  }
}

const slow = (ms, value = "done") =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

// 1. Resolves normally when nothing aborts.
check("passes through the resolved value", (await abortable(slow(10), new AbortController().signal)) === "done");

// 2. Settles on abort instead of waiting out the slow work.
{
  const c = new AbortController();
  const t0 = Date.now();
  setTimeout(() => c.abort(), 20);
  let name = "";
  try {
    await abortable(slow(5000), c.signal);
    name = "RESOLVED";
  } catch (e) {
    name = e.name;
  }
  const elapsed = Date.now() - t0;
  check("rejects promptly on abort", name === "AbortError" && elapsed < 500, `(${name} after ${elapsed}ms)`);
}

// 3. An already-aborted signal never starts the wait.
{
  const c = new AbortController();
  c.abort();
  let name = "";
  try {
    await abortable(slow(5000), c.signal);
  } catch (e) {
    name = e.name;
  }
  check("rejects immediately if already aborted", name === "AbortError", `(${name})`);
}

// 4. No signal means no behaviour change.
check("no signal passes through", (await abortable(slow(5, "x"))) === "x");

// 5. The underlying rejection still surfaces when it loses the race.
{
  let msg = "";
  try {
    await abortable(Promise.reject(new Error("engine blew up")), new AbortController().signal);
  } catch (e) {
    msg = e.message;
  }
  check("underlying rejection propagates", msg === "engine blew up", `(${msg})`);
}

// 6. Listener is removed once settled, so long batches don't leak.
{
  const c = new AbortController();
  let live = 0;
  const realAdd = c.signal.addEventListener.bind(c.signal);
  const realRemove = c.signal.removeEventListener.bind(c.signal);
  c.signal.addEventListener = (...a) => {
    live += 1;
    return realAdd(...a);
  };
  c.signal.removeEventListener = (...a) => {
    live -= 1;
    return realRemove(...a);
  };
  await abortable(slow(5), c.signal);
  check("removes its abort listener", live === 0, `(${live} left)`);
}

// 7. The batch runner still ignores worker return values (per-item outcomes).
{
  const seen = [];
  await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
    seen.push(n);
    return n % 2 ? "done" : "error";
  });
  check("batch runner visits every item", seen.length === 4, `(${seen.length})`);
}

console.log(failures ? `\n${failures} FAILING` : "\nall checks passed");
process.exit(failures ? 1 : 0);
