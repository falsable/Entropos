// Synthetic prompts for the offline router measurement (eval/router_noise.ts). Written by hand before any run.
// Label (needs_strong): would a competent reviewer say a cheap model (Gemini Flash class) is likely to fail it?
// Design: 4 cells (cheap/strong x short/long), 10 prompts each, split 5 dev / 5 held-out inside each cell. Short < 80 chars,
// long > 300 chars. Length is crossed with difficulty on purpose: the router classifies by character entropy.
export interface Case {
  id: string;
  label: 'cheap' | 'strong';
  length: 'short' | 'long';
  split: 'dev' | 'heldout';
  prompt: string;
}

const BOILER = (n: string) =>
  `Here is the file ${n}. Add a docstring to every function, keep the code exactly as it is, and return the full file. ` +
  `import os\nimport sys\n\ndef read(path):\n    with open(path) as f:\n        return f.read()\n\ndef write(path, text):\n    with open(path, 'w') as f:\n        f.write(text)\n\n` +
  `def main():\n    text = read(sys.argv[1])\n    write(sys.argv[2], text.upper())\n\nif __name__ == '__main__':\n    main()\n`;

type Row = [Case['label'], Case['length'], string];
const rows: Row[] = [
  // cheap, short
  ['cheap', 'short', 'Convert 5 km to miles.'],
  ['cheap', 'short', 'Write a haiku about rain.'],
  ['cheap', 'short', 'Capital of Portugal?'],
  ['cheap', 'short', 'Translate "good morning" to French.'],
  ['cheap', 'short', 'Give me a regex that matches a 5-digit zip code.'],
  ['cheap', 'short', 'Rename this variable to snake_case: userAccountId'],
  ['cheap', 'short', 'What does HTTP 404 mean?'],
  ['cheap', 'short', 'Fix the typo: "recieve the pacakge"'],
  ['cheap', 'short', 'List three uses of the git stash command.'],
  ['cheap', 'short', 'Format 1234567.891 as USD with two decimals.'],
  // cheap, long
  ['cheap', 'long', BOILER('io_utils.py')],
  ['cheap', 'long', BOILER('files.py')],
  ['cheap', 'long', BOILER('copy_upper.py')],
  ['cheap', 'long', BOILER('upper.py')],
  ['cheap', 'long', BOILER('cli.py')],
  ['cheap', 'long', 'Please summarize the following meeting notes in three bullet points. Monday: the team agreed to move the release to Thursday because QA found two cosmetic bugs in the settings page. Tuesday: the design review approved the new onboarding screens; the copy for the empty states is still pending from marketing. Wednesday: support reported that the export button is slow for large accounts, but no data was lost. Thursday: release went out at noon, no incidents.'],
  ['cheap', 'long', 'Rewrite this email so it sounds friendlier but keeps every date and number: "Your invoice 20931 for 480 EUR is overdue since March 3. Payment must be received by March 20 or the service will be suspended on March 21. Contact billing at the address below if you believe this is an error. Regards, Billing." Keep it under 90 words and do not add promises we have not made.'],
  ['cheap', 'long', 'Extract the product names and prices from this text and give them as a markdown table: The Alder desk lamp costs 39.90, the Birch shelf is 120 euros, a pack of Cedar coasters goes for 12.50, the Dune office chair is priced at 249 and the Elm planter is 18. Shipping is free over 100 euros. Prices include VAT. Do not invent anything that is not in the text, and keep the original order of the items.'],
  ['cheap', 'long', 'Turn this list into a JSON array of objects with fields name and quantity: 3 apples, 12 eggs, 1 loaf of bread, 2 liters of milk, 6 bananas, 1 kg of rice, 4 tomatoes, 1 jar of honey, 2 packs of pasta, 5 lemons. Quantities are numbers, units go inside the name, and the order must be preserved exactly as written above without any commentary.'],
  ['cheap', 'long', 'Write a polite out-of-office reply for me. I am away from Monday 10 to Friday 14, back on Monday 17, with no access to email. For urgent matters people should contact my colleague at the support address. Mention that I will answer everything else when I return, keep it under 80 words, avoid exclamation marks, and sign it with my first name only.'],
  // strong, short
  ['strong', 'short', 'Prove that sqrt(2) is irrational.'],
  ['strong', 'short', 'Why does this deadlock? Two locks, two threads, reverse order.'],
  ['strong', 'short', 'Design a rate limiter that survives a Redis outage.'],
  ['strong', 'short', 'Is P(A|B) = P(B|A) ever true? Give conditions.'],
  ['strong', 'short', 'Derive the time complexity of building a heap bottom-up.'],
  ['strong', 'short', 'Find the race in a double-checked locking singleton.'],
  ['strong', 'short', 'Prove there are infinitely many primes of form 4k+3.'],
  ['strong', 'short', 'How do I make this migration zero-downtime with a rename?'],
  ['strong', 'short', 'Show that quicksort expected comparisons are O(n log n).'],
  ['strong', 'short', 'Can CRDT counters ever decrease safely? Argue it.'],
  // strong, long
  ['strong', 'long', 'We run a payments service with an outbox table and a poller that publishes to Kafka. Under load we sometimes see the same event published twice and, rarely, an event published before the transaction that created it is visible to consumers reading the database. Explain every interleaving that can cause each symptom, tell me which isolation level and which locking strategy remove them, and what the poller must do on crash recovery to keep ordering per aggregate.'],
  ['strong', 'long', 'Given a sorted array of n integers and a target sum S, I need to count the triples whose sum equals S, in O(n^2). Handle duplicates correctly: triples are counted by index, not by value. Derive the algorithm step by step, prove that the two-pointer sweep never skips a valid pair when duplicates are present, and show the exact counting formula when many equal values appear on both pointers at once.'],
  ['strong', 'long', 'Our feature flag service evaluates rules locally from a snapshot refreshed every 30 seconds. Two services read the same flag and sometimes disagree for a short window, which broke a checkout flow that assumed both would flip together. Propose a design that gives per-request consistency for flags that gate multi-service flows, state the failure modes of your proposal, and explain what you give up in latency and availability compared with the current snapshot approach.'],
  ['strong', 'long', 'Consider a loss function L(w) = ||Xw - y||^2 + lambda * ||w||_1 with X of full column rank. Show whether the solution path is piecewise linear in lambda, derive the breakpoints for the orthonormal-design case, and explain why the general case needs the active-set conditions. State clearly which claims need the full-rank assumption and which hold without it, and give a small counterexample for any claim that fails.'],
  ['strong', 'long', 'A distributed lock service gives out leases with a TTL. A client holds the lease, pauses for a long garbage collection, resumes, and writes to storage after another client has already acquired the lease. Explain why TTL alone cannot prevent this, show how fencing tokens fix it, what the storage layer must check, and why a monotonic token from a single-node clock is not enough if the lock service itself fails over.'],
  ['strong', 'long', 'I have a Postgres table with 400 million rows partitioned by month, and a query that joins it with a small dimension table and groups by a text column. It uses a sequential scan on every partition even though there is an index on the join key, and it got slower after we added a partition. Walk through how the planner chooses here, what statistics could mislead it, how to verify each hypothesis with EXPLAIN, and which fix is safest in production.'],
  ['strong', 'long', 'Prove or refute: in a leader-based consensus protocol with 2f+1 replicas, a client that receives a commit acknowledgment from the leader can always read its write from any replica after the leader crashes. Consider both the case where the leader waits for a quorum before acknowledging and the case where it acknowledges after its own log append, and spell out what a new leader must do before serving reads.'],
  ['strong', 'long', 'We are replacing a monolith cron job with an event-driven pipeline. The cron job guaranteed that exactly one run happened per day and that runs never overlapped. List the guarantees the new design must reproduce, show how at-least-once delivery and consumer restarts break each one, and propose a minimal mechanism with state that restores them, including how it behaves when the clock changes for daylight saving time.'],
  ['strong', 'long', 'Explain why gradient descent with a fixed step size converges on a convex function with L-Lipschitz gradient when the step is at most 1/L, derive the O(1/k) rate in objective value from the descent lemma, and then say what changes if the function is also mu-strongly convex. Show where each assumption is used in the proof and what fails when the step exceeds 2/L.'],
  ['strong', 'long', 'An API returns pages using an offset cursor over a table that is being written to. Clients report both missing and duplicated items when they paginate while inserts and deletes happen. Characterize exactly which sequences of operations cause misses and which cause duplicates, show why keyset pagination fixes one but not necessarily the other, and design a stable cursor that tolerates deletions of the last-seen row.'],
];

const perCell: Record<string, number> = {};
export const CORPUS: Case[] = rows.map(([label, length, prompt]) => {
  const key = `${label}/${length}`;
  const n = (perCell[key] = (perCell[key] || 0) + 1);
  return { id: `${key}#${n}`, label, length, split: n <= 5 ? 'dev' : 'heldout', prompt };
});
