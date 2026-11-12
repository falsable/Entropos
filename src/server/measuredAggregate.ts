// @a2dlc:slice_id = "beads-entropos-4e6_5_1.6d5b36"
// @a2dlc:mode = "lite"
// @a2dlc:rationale = "Separate measured-vs-missing counting from summation so absence of data never reads as zero."
// @a2dlc:rejected_alternatives = []
// @a2dlc:protected_invariants = []
// @a2dlc:do_not_refactor = []

export interface MeasuredAggregate {
  measuredCount: number;
  totalCount: number;
  sum: number | null;
}

/**
 * Aggregates a ledger field while treating missing values distinctly from zero.
 */
export function measuredAggregate(values: Array<number | null | undefined>): MeasuredAggregate {
  const totalCount = values.length;
  let measuredCount = 0;
  let sum = 0;

  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      measuredCount += 1;
      sum += value;
    }
  }

  return {
    measuredCount,
    totalCount,
    sum: measuredCount > 0 ? sum : null,
  };
}
