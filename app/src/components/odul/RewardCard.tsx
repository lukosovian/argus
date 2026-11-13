import type { CSSProperties, ReactNode } from 'react'
import type { OdulReward } from '../../lib/api'
import { catalogItem, frameStyle, KIND_LABEL, RARITY_NAMES } from '../../lib/oduller'
import { useProfiles } from '../../hooks/useProfiles'
import { tt } from '../../lib/i18n'
import './odul.css'

// Ödül kartı (v1.24): arka yüz (seçilen kart arkası) ve ön yüz. Film kartında yapımın afişi tam boy, altta adı, yılı
// ve senin puanın; kozmetik ödülde önizlemesi ve türü. `still` verilirse çevrilmez, hep ön yüz görünür (albüm).

export function backClass(key?: string | null) {
  const id = key?.startsWith('back:') ? key.slice(5) : 'klasik'
  return `ob-${['gece', 'retro', 'folyo', 'neon', 'altin'].includes(id) ? id : 'klasik'}`
}

export function CardBack({ backKey }: { backKey?: string | null }) {
  return (
    <div className={`oc-back ${backClass(backKey)}`}>
      <b>ARGUS</b>
    </div>
  )
}

// Avatar + çerçeve önizlemesi
export function FramePreview({ frameKey, size = 96 }: { frameKey: string; size?: number }) {
  const { activeProfile } = useProfiles()
  const photo = activeProfile?.photo
  return (
    <span className="block rounded-full" style={{ padding: Math.max(3, size * 0.05), ...(frameStyle(frameKey) ?? {}) }}>
      <span className="flex items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-neutral-400" style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} /> : (activeProfile?.username.slice(0, 1).toUpperCase() ?? '?')}
      </span>
    </span>
  )
}

function MiniNeonTicket({ w }: { w: number }) {
  return (
    <div
      className="relative flex flex-col justify-center overflow-hidden"
      style={{ width: w, height: w * 0.46, borderRadius: w * 0.06, padding: `0 ${w * 0.09}px`, background: '#07051a', boxShadow: 'inset 0 0 0 2px #ff3fd0, inset 0 0 18px #ff3fd0, 0 0 14px rgba(255,63,208,.5)', color: '#fff' }}
    >
      <i style={{ fontStyle: 'normal', fontSize: w * 0.055, letterSpacing: '.3em', fontWeight: 800, color: '#3ff0ff', textShadow: '0 0 6px #3ff0ff' }}>{tt('ARGUS SİNEMA')}</i>
      <b style={{ fontSize: w * 0.11, fontWeight: 900, textShadow: '0 0 4px #fff, 0 0 10px #ff3fd0, 0 0 20px #ff3fd0' }}>{tt('Neon')}</b>
      <span className="absolute top-[12%] bottom-[12%]" style={{ right: w * 0.24, borderLeft: '2px dashed rgba(63,240,255,.6)' }} />
    </div>
  )
}

// Kozmetik ödülün görseli
export function ItemArt({ itemKey, w }: { itemKey: string; w: number }) {
  if (itemKey.startsWith('frame:')) return <FramePreview frameKey={itemKey} size={w * 0.42} />
  if (itemKey.startsWith('back:'))
    return (
      <div className="oc static" style={{ '--w': `${w * 0.42}px` } as CSSProperties}>
        <div className="oc-flip">
          <CardBack backKey={itemKey} />
        </div>
      </div>
    )
  if (itemKey === 'bilet:neon') return <MiniNeonTicket w={w * 0.74} />
  return null
}

export function RewardCard({
  reward,
  w,
  backKey,
  shown,
  still,
  badge,
  no,
  onClick,
  style,
  children,
}: {
  reward: OdulReward
  w: number
  backKey?: string | null
  shown?: boolean
  still?: boolean
  badge?: { text: string; dup?: boolean } | null
  no?: number
  onClick?: () => void
  style?: CSSProperties
  children?: ReactNode
}) {
  const RN = RARITY_NAMES()
  const it = reward.kind === 'item' ? catalogItem(reward.key) : null
  return (
    <div className={`oc r${reward.r} ${shown ? 'shown' : ''} ${still ? 'static' : ''}`} style={{ '--w': `${w}px`, ...style } as CSSProperties} onClick={onClick}>
      <div className="oc-flip">
        {!still && <CardBack backKey={backKey} />}
        <div className="oc-face">
          {reward.kind === 'card' ? (
            <>
              {reward.poster ? <img className="oc-poster" src={reward.poster} alt="" draggable={false} /> : <div className="oc-poster bg-neutral-800" />}
              <div className="oc-shade" />
              {reward.foil && <div className="oc-holo" />}
              <span className="oc-gem">{RN[reward.r]}</span>
              <div className="oc-meta">
                <b>{reward.title}</b>
                <small>
                  <span>
                    {[reward.year, reward.foil ? tt('Parlak') : '', no ? `#${String(no).padStart(3, '0')}` : ''].filter(Boolean).join(' · ')}
                  </span>
                  {reward.rating != null && <i>★ {Number.isInteger(reward.rating) ? reward.rating : reward.rating.toFixed(1)}</i>}
                </small>
              </div>
            </>
          ) : (
            <>
              <div className="oc-art">
                <ItemArt itemKey={reward.key} w={w} />
              </div>
              <div className="oc-imeta">
                <b>{it?.name() ?? reward.key}</b>
                <small>
                  <span>{it ? KIND_LABEL(it.kind) : ''}</span>
                  <em>{RN[reward.r]}</em>
                </small>
              </div>
            </>
          )}
          {badge && <span className={`oc-badge ${badge.dup ? 'dup' : ''}`}>{badge.text}</span>}
          {children}
        </div>
      </div>
    </div>
  )
}
