import Image from 'next/image'

export function TeamBlock({ name, crest }: { name: string; crest: string }) {
  return (
    <div className="flex min-w-[120px] flex-col items-center gap-2">
      {crest ? (
        <Image src={crest} alt={name} width={68} height={68} className="rounded" />
      ) : (
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/10 bg-white/10 text-4xl">⚽</div>
      )}
      <span className="text-center text-base font-bold text-white">{name}</span>
    </div>
  )
}
