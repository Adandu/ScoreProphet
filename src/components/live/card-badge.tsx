export function CardBadge({ card }: { card: string }) {
  const isRed = card === 'RED_CARD' || card === 'YELLOW_RED_CARD'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 14,
        background: isRed ? '#EF4444' : '#FACC15',
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    />
  )
}
