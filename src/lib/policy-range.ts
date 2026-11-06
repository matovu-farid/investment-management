function percentage(value: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new Error('Enter a valid percentage with up to two decimal places.')
  const points = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  if (points > 10000) throw new Error('Allocation percentages must be between 0 and 100%.')
  return points
}

export function validatePolicyRange(minimum: string, maximum: string, target: string) {
  const min = percentage(minimum)
  const max = percentage(maximum)
  const targetPoints = target.trim() ? percentage(target) : null
  if (min > max) throw new Error('The minimum allocation cannot exceed the maximum allocation.')
  if (targetPoints !== null && (targetPoints < min || targetPoints > max)) {
    throw new Error('The target allocation must be between the minimum and maximum.')
  }
  return { min: String(min), max: String(max), target: targetPoints === null ? '' : String(targetPoints) }
}
