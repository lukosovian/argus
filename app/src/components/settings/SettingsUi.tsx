import type { ReactNode } from 'react'

// Ayarlar sayfasının ortak parçaları — kullanıcı "ayarlar arayüzünü güzelleştirebilir misin" dedi.
// Her panel (Veritabanı, Ana Sayfa Ayarları…) aynı başlık, aynı sekme düğmeleri ve aynı kart
// görünümünü kullansın diye tek yerde.

export function PanelHeader({ title, description, extra }: { title: string; description?: string; extra?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-neutral-50">{title}</h2>
        {extra}
      </div>
      {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
    </div>
  )
}

// Hap şeklinde alt sekmeler (eskiden alt çizgili yazılardı).
export function SettingsTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, string])[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-6 overflow-x-auto no-scrollbar">
      <div className="inline-flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/70 p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`whitespace-nowrap text-sm font-medium rounded-lg px-3.5 py-1.5 transition ${
              value === key
                ? 'bg-neutral-800 text-neutral-50 shadow-sm ring-1 ring-[#00c0fa]/40'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Başlıklı ayar kartı — içindeki satırlar ince çizgilerle ayrılıyor.
export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50">
      <header className="px-5 pt-4 pb-3 border-b border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
      </header>
      <div className="px-5 py-4 space-y-4 [&>*+*]:pt-4 [&>*+*]:border-t [&>*+*]:border-neutral-800/80">{children}</div>
    </section>
  )
}

// Seçili/seçili değil düğme görünümü (kart boyutu, sıralama gibi küçük seçimler için).
export function choiceClass(active: boolean) {
  return active
    ? 'bg-[#00c0fa]/10 border-[#00c0fa]/50 text-neutral-50'
    : 'bg-neutral-800/60 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
}
