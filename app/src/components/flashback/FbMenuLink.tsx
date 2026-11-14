import { Link } from 'react-router-dom'
import { FbMark } from './FbLogo'
import { tt } from '../../lib/i18n'

// Menüdeki Flashback (v1.24): kullanıcı "menüde de kendi logosunu kullansın, yeri çerçeveli, aynı temada, animasyonlu
// olabilir" dedi. Kenarında camgöbeği–eflatun ışık dolaşır, logo arada bir bozulur, üstüne gelince titrer.
export default function FbMenuLink({ isNew, onClick, compact }: { isNew: boolean; onClick: () => void; compact?: boolean }) {
  const year = new Date().getFullYear()
  return (
    <div className={`fb-menu fb-hover ${compact ? '' : 'mx-1.5'} my-1`}>
      <Link to="/flashback" onClick={onClick}>
        <FbMark className="h-8 w-8 shrink-0" anim="always" />
        <span className="flex-1 min-w-0 leading-none">
          <span className="fb-wordmark text-[17px]">FLASHBACK</span>
          <span className="block text-[10px] tracking-[0.25em] text-white/50 mt-1">{tt('{0} ÖZETİN', year)}</span>
        </span>
        {isNew && <span className="text-[10px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: 'linear-gradient(90deg,#00b8d9,#ff2d8a)' }}>{tt('YENİ')}</span>}
      </Link>
    </div>
  )
}
