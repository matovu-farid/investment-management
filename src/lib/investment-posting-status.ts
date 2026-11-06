type OriginalSnapshot = { journalId:string|null; reversalId:string|null; reversalDate:string|null }
type Version = { journalId:string; journalDate:string; isCorrection:number; reversalId:string|null; reversalDate:string|null; hasSuccessor:number }

/** The source and history are fetched independently; never claim a status if they disagree. */
export function describeInvestmentPosting(source:OriginalSnapshot, versions:Version[], asOfDate:string):string {
  if (!source.journalId && versions.length === 0) return 'Not posted'
  const originals = versions.filter(v => !v.isCorrection)
  const terminal = versions.filter(v => !v.hasSuccessor)
  if (originals.length !== 1 || terminal.length !== 1 || originals[0].journalId !== source.journalId || originals[0].reversalId !== source.reversalId || originals[0].reversalDate !== source.reversalDate) return 'Status changed while loading; reload and inspect journal history'
  const latest = terminal[0], label = `${latest.isCorrection ? 'Replacement' : 'Original'} journal ${latest.journalId}`
  if (latest.journalDate > asOfDate) return `${label} scheduled · effective ${latest.journalDate}`
  if (!latest.reversalId) return `${label} posted · effective ${latest.journalDate}`
  if (!latest.reversalDate) return 'Status changed while loading; reload and inspect journal history'
  if (latest.reversalDate > asOfDate) return `${label} posted · reversal scheduled for ${latest.reversalDate}`
  return `${label} reversed · effective ${latest.reversalDate}`
}
