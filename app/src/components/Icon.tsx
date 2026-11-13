// ARGUS'un kendi dolgulu ikonları — kullanıcı "emojisel şeyleri kullanmasak, onlar yerine kendi ikonlarımız olsun,
// dış hatlı değil dolgulu" dedi. Emojiler her bilgisayarda/telefonda farklı görünüyordu ve uygulamanın tarzına
// uymuyordu. Hepsi 24×24, tek renk (currentColor — yazının rengini alır), köşeleri yumuşak: şekil hem dolgu hem
// aynı renkte ince yuvarlak uçlu çizgiyle çiziliyor, böylece sivri köşeler biraz yuvarlanıyor.
import { useId, type CSSProperties } from 'react'

export type IconName =
  | 'star'
  | 'play'
  | 'pause'
  | 'stop'
  | 'caret'
  | 'clapper'
  | 'calendar'
  | 'tv'
  | 'film'
  | 'volume'
  | 'mute'
  | 'search'
  | 'bookmark'
  | 'sparkle'
  | 'person'
  | 'bulb'
  | 'party'
  | 'flame'
  | 'pin'
  | 'gear'
  | 'pencil'
  | 'external'
  | 'check'
  | 'table'
  | 'chart'
  | 'trophy'
  | 'planet'
  | 'clock'
  | 'help'
  | 'sun'
  | 'moon'
  | 'bell'
  | 'cards'
  | 'home'
  | 'grid'
  | 'menu'
  | 'share'
  | 'globe'
  | 'repeat'

// Her ikon: dolgulu parçalar (d) ve istenirse "oyuk" parçalar (cut: arka plana göre boşluk — evenodd ile)
const PATHS: Partial<Record<IconName, string>> = {
  star: 'M12 3.2l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.5l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z',
  play: 'M8 5.3v13.4c0 .8.86 1.28 1.54.86l10.7-6.7a1 1 0 0 0 0-1.72L9.54 4.44C8.86 4.02 8 4.5 8 5.3z',
  pause: 'M7 4.5h2.6c.5 0 .9.4.9.9v13.2c0 .5-.4.9-.9.9H7c-.5 0-.9-.4-.9-.9V5.4c0-.5.4-.9.9-.9zM14.4 4.5H17c.5 0 .9.4.9.9v13.2c0 .5-.4.9-.9.9h-2.6c-.5 0-.9-.4-.9-.9V5.4c0-.5.4-.9.9-.9z',
  stop: 'M7 6h10c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1z',
  caret: 'M9.5 6.8v10.4c0 .45.52.7.87.42l6.2-5.2a.55.55 0 0 0 0-.84l-6.2-5.2a.53.53 0 0 0-.87.42z',
  // Klaket: üstte eğik çizgili kapak, altta gövde (kapaktaki çizgiler oyuk)
  clapper:
    'M4 10.5h16v8c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2zM3.6 8.4l-.35-1.5c-.2-.9.35-1.8 1.25-2l11.8-2.75c.9-.2 1.8.35 2 1.25l.35 1.5zM6.6 7.7l2.5-2.9 1.9-.45-2.5 2.9zM11.4 6.6l2.5-2.9 1.9-.45-2.5 2.9z',
  calendar:
    'M7.5 2.8c.5 0 .9.4.9.9V5h7.2V3.7c0-.5.4-.9.9-.9s.9.4.9.9V5h.6c1.4 0 2.5 1.1 2.5 2.5v2H3.5v-2C3.5 6.1 4.6 5 6 5h.6V3.7c0-.5.4-.9.9-.9zM3.5 11h17v7.5c0 1.4-1.1 2.5-2.5 2.5H6c-1.4 0-2.5-1.1-2.5-2.5zM7 13.2v2.2h2.2v-2.2zM10.9 13.2v2.2h2.2v-2.2zM14.8 13.2v2.2H17v-2.2z',
  tv: 'M4.5 6.8h15c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-15c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2zM7.3 3.1a.8.8 0 0 1 1.13-.1L12 5.9l3.57-2.9a.8.8 0 1 1 1 1.25L13.1 7.1h-2.2L7.43 4.25a.8.8 0 0 1-.13-1.15zM8.5 20.6h7a.7.7 0 0 1 0 1.4h-7a.7.7 0 0 1 0-1.4z',
  film: 'M5.5 3h13C19.9 3 21 4.1 21 5.5v13c0 1.4-1.1 2.5-2.5 2.5h-13C4.1 21 3 19.9 3 18.5v-13C3 4.1 4.1 3 5.5 3zM5 5.5V7h2V5.5zM5 9.25v1.5h2v-1.5zM5 13.25v1.5h2v-1.5zM5 17v1.5h2V17zM17 5.5V7h2V5.5zM17 9.25v1.5h2v-1.5zM17 13.25v1.5h2v-1.5zM17 17v1.5h2V17zM9 5.5v5.75h6V5.5zM9 12.75v5.75h6v-5.75z',
  volume:
    'M3.5 9.2c0-.7.5-1.2 1.2-1.2H7.5l4.4-3.7c.65-.55 1.6-.08 1.6.76v13.9c0 .84-.95 1.3-1.6.76L7.5 16H4.7c-.7 0-1.2-.5-1.2-1.2zM16.1 8.2a.9.9 0 0 1 1.27.05 5.5 5.5 0 0 1 0 7.5.9.9 0 1 1-1.32-1.22 3.7 3.7 0 0 0 0-5.06.9.9 0 0 1 .05-1.27zM18.6 5.6a.9.9 0 0 1 1.27 0 9.2 9.2 0 0 1 0 12.8.9.9 0 1 1-1.3-1.24 7.4 7.4 0 0 0 0-10.32.9.9 0 0 1 .03-1.24z',
  mute: 'M3.5 9.2c0-.7.5-1.2 1.2-1.2H7.5l4.4-3.7c.65-.55 1.6-.08 1.6.76v13.9c0 .84-.95 1.3-1.6.76L7.5 16H4.7c-.7 0-1.2-.5-1.2-1.2zM16.3 9.3a.9.9 0 0 1 1.27 0L19 10.73l1.43-1.43a.9.9 0 1 1 1.27 1.27L20.27 12l1.43 1.43a.9.9 0 1 1-1.27 1.27L19 13.27l-1.43 1.43a.9.9 0 1 1-1.27-1.27L17.73 12l-1.43-1.43a.9.9 0 0 1 0-1.27z',
  search:
    'M10.5 3a7.5 7.5 0 0 1 6.05 11.93l3.76 3.76a1.15 1.15 0 1 1-1.62 1.62l-3.76-3.76A7.5 7.5 0 1 1 10.5 3zM10.5 5.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8z',
  bookmark: 'M7 3h10c1.1 0 2 .9 2 2v15.2c0 .75-.85 1.2-1.47.77L12 17.2l-5.53 3.77C5.85 21.4 5 20.95 5 20.2V5c0-1.1.9-2 2-2z',
  sparkle:
    'M10 3.5c.3 0 .55.2.62.48l.9 3.5a4 4 0 0 0 2.9 2.9l3.5.9a.64.64 0 0 1 0 1.24l-3.5.9a4 4 0 0 0-2.9 2.9l-.9 3.5a.64.64 0 0 1-1.24 0l-.9-3.5a4 4 0 0 0-2.9-2.9l-3.5-.9a.64.64 0 0 1 0-1.24l3.5-.9a4 4 0 0 0 2.9-2.9l.9-3.5A.64.64 0 0 1 10 3.5zM18.5 2.5c.17 0 .3.1.35.27l.3 1.1c.12.45.47.8.92.92l1.1.3a.36.36 0 0 1 0 .7l-1.1.3c-.45.12-.8.47-.92.92l-.3 1.1a.36.36 0 0 1-.7 0l-.3-1.1a1.3 1.3 0 0 0-.92-.92l-1.1-.3a.36.36 0 0 1 0-.7l1.1-.3c.45-.12.8-.47.92-.92l.3-1.1a.36.36 0 0 1 .35-.27z',
  person: 'M12 3.5a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5zM12 13.5c4.3 0 7.5 2.3 7.5 5.2v.8c0 .55-.45 1-1 1h-13c-.55 0-1-.45-1-1v-.8c0-2.9 3.2-5.2 7.5-5.2z',
  bulb: 'M12 2.5a6.8 6.8 0 0 1 4.1 12.2c-.6.45-1 1.1-1 1.85v.45H8.9v-.45c0-.75-.4-1.4-1-1.85A6.8 6.8 0 0 1 12 2.5zM8.9 18.5h6.2v.5c0 1.4-1.1 2.5-2.5 2.5h-1.2c-1.4 0-2.5-1.1-2.5-2.5z',
  // Konfeti külahı + uçuşan parçalar
  party:
    'M3.3 19.4l4.2-11.6c.2-.55.9-.7 1.32-.29l7.67 7.67c.41.41.26 1.12-.29 1.32L4.6 20.7c-.8.29-1.58-.49-1.3-1.3zM14.2 3.3a.9.9 0 0 1 1.1.65c.3 1.2.05 2.45-.7 3.4a.9.9 0 1 1-1.4-1.13c.4-.5.53-1.15.38-1.8a.9.9 0 0 1 .62-1.12zM20.7 9.8a.9.9 0 0 1-.65 1.1c-1.2.3-2.45.05-3.4-.7a.9.9 0 1 1 1.13-1.4c.5.4 1.15.53 1.8.38a.9.9 0 0 1 1.12.62zM18.4 3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM20.8 14.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM10.2 2.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  flame:
    'M12 2.5c.4 0 .75.25.9.6.9 2.2 2.6 3.7 3.9 5.3 1.2 1.5 2.2 3.2 2.2 5.6A7 7 0 0 1 5 14c0-2.2.9-4 2.2-5.4.35-.38.97-.2 1.08.3.2.9.6 1.7 1.2 2.3.1-3 1.1-5.6 1.7-7.9.12-.45.5-.8.82-.8zM12 13c-1.3 1-2.3 2.3-2.3 3.8a2.3 2.3 0 0 0 4.6 0c0-1.5-1-2.8-2.3-3.8z',
  pin: 'M12 2.5a7.3 7.3 0 0 1 7.3 7.3c0 4.4-4.4 9.1-6.4 11.05a1.3 1.3 0 0 1-1.8 0C9.1 18.9 4.7 14.2 4.7 9.8A7.3 7.3 0 0 1 12 2.5zM12 7a2.8 2.8 0 1 0 0 5.6A2.8 2.8 0 0 0 12 7z',
  pencil: 'M15.6 3.6a2.3 2.3 0 0 1 3.25 0l1.55 1.55a2.3 2.3 0 0 1 0 3.25L9.3 19.5l-5.1 1.3c-.6.15-1.15-.4-1-1l1.3-5.1z',
  external:
    'M13.5 3.5h6.1c.5 0 .9.4.9.9v6.1a.9.9 0 0 1-1.8 0V6.6l-7.3 7.3a.9.9 0 0 1-1.27-1.27l7.3-7.3h-3.93a.9.9 0 0 1 0-1.8zM6 5.5h4a.9.9 0 0 1 0 1.8H6c-.4 0-.7.3-.7.7v10c0 .4.3.7.7.7h10c.4 0 .7-.3.7-.7v-4a.9.9 0 0 1 1.8 0v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8A2.5 2.5 0 0 1 6 5.5z',
  check: 'M9.6 15.4l-3.6-3.6a1.25 1.25 0 0 0-1.77 1.77l4.48 4.48c.49.49 1.28.49 1.77 0l9.3-9.3a1.25 1.25 0 0 0-1.77-1.77z',
  bell: 'M12 2.5a6.5 6.5 0 0 1 6.5 6.5c0 4.2 1 6.4 2 7.6.5.6.1 1.4-.65 1.4H4.15c-.75 0-1.15-.8-.65-1.4 1-1.2 2-3.4 2-7.6A6.5 6.5 0 0 1 12 2.5zM9.6 19.6h4.8a2.4 2.4 0 0 1-4.8 0z',
  home: 'M10.7 3.5a2 2 0 0 1 2.6 0l7 5.9c.45.38.7.94.7 1.53V19c0 1.1-.9 2-2 2h-3.5c-.55 0-1-.45-1-1v-4.5c0-.55-.45-1-1-1h-3c-.55 0-1 .45-1 1V20c0 .55-.45 1-1 1H5c-1.1 0-2-.9-2-2v-8.07c0-.59.26-1.15.7-1.53z',
  grid: 'M5 3.5h4c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5H5c-.83 0-1.5-.67-1.5-1.5V5c0-.83.67-1.5 1.5-1.5zM15 3.5h4c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-4c-.83 0-1.5-.67-1.5-1.5V5c0-.83.67-1.5 1.5-1.5zM5 13.5h4c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5H5c-.83 0-1.5-.67-1.5-1.5v-4c0-.83.67-1.5 1.5-1.5zM15 13.5h4c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-4c-.83 0-1.5-.67-1.5-1.5v-4c0-.83.67-1.5 1.5-1.5z',
  share:
    'M12 2.8c.3 0 .58.12.8.34l3.6 3.6a1.1 1.1 0 0 1-1.56 1.56L13.1 6.56V14a1.1 1.1 0 0 1-2.2 0V6.56L9.16 8.3A1.1 1.1 0 0 1 7.6 6.74l3.6-3.6c.22-.22.5-.34.8-.34zM5 11.5c.6 0 1.1.5 1.1 1.1v5.4c0 .5.4.9.9.9h10c.5 0 .9-.4.9-.9v-5.4a1.1 1.1 0 0 1 2.2 0v5.4c0 1.7-1.4 3.1-3.1 3.1H7c-1.7 0-3.1-1.4-3.1-3.1v-5.4c0-.6.5-1.1 1.1-1.1z',
  menu: 'M4.5 4.9h15a1.35 1.35 0 0 1 0 2.7h-15a1.35 1.35 0 0 1 0-2.7zM4.5 10.65h15a1.35 1.35 0 0 1 0 2.7h-15a1.35 1.35 0 0 1 0-2.7zM4.5 16.4h15a1.35 1.35 0 0 1 0 2.7h-15a1.35 1.35 0 0 1 0-2.7z',
}

// Yumuşatma çizgisi istenmeyenler (ince detaylı, oyuklu ya da zaten yuvarlak çizilmiş olanlar)
const NO_SOFTEN = new Set<IconName>(['tv', 'calendar', 'film', 'clapper', 'search', 'pin', 'gear', 'external', 'volume', 'mute', 'party', 'sparkle', 'flame', 'pencil', 'check', 'bell', 'home', 'grid', 'menu', 'share'])

// Birden fazla parçadan oluşan ikonlar: dolgu (d), kalın yuvarlak uçlu çizgiler (line — güneşin ışınları, kupanın
// kulpları gibi) ve şeklin içinden oyulan çizgiler (cut — soru işareti, saat ibresi, tablo çizgileri). Oyma, arka
// plan rengini bilmeden gerçek bir boşluk bırakır (mask).
interface Complex {
  d?: string[]
  line?: string
  lw?: number
  cut?: string
  cw?: number
}
const COMPLEX: Partial<Record<IconName, Complex>> = {
  // Ne İzlesem: önde dik bir kart, arkasında eğik ikincisi (aralarında oyuk boşluk)
  cards: {
    d: ['M5 2.6h6c1.33 0 2.4 1.07 2.4 2.4v12c0 1.33-1.07 2.4-2.4 2.4H5A2.4 2.4 0 0 1 2.6 17V5C2.6 3.67 3.67 2.6 5 2.6z', 'M13.4 3.93L23.01 6.69 18.6 22.07 8.99 19.31z'],
    line: 'M13.4 3.93L23.01 6.69 18.6 22.07 8.99 19.31z',
    lw: 1.6,
    cut: 'M5 2.6h6c1.33 0 2.4 1.07 2.4 2.4v12c0 1.33-1.07 2.4-2.4 2.4H5A2.4 2.4 0 0 1 2.6 17V5C2.6 3.67 3.67 2.6 5 2.6z',
    cw: 2.4,
  },
  gear: {
    d: ['M12 4.6a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    line: 'M19 12h2.6M16.95 16.95l1.84 1.84M12 19v2.6M7.05 16.95l-1.84 1.84M5 12H2.4M7.05 7.05L5.21 5.21M12 5V2.4M16.95 7.05l1.84-1.84',
    lw: 3.4,
  },
  table: { d: ['M5.5 3.5h13c1.1 0 2 .9 2 2v13c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2v-13c0-1.1.9-2 2-2z'], cut: 'M3 9.5h18M3 15h18M9.5 9.5V21', cw: 1.7 },
  chart: {
    d: [
      'M4.2 12h2.6c.66 0 1.2.54 1.2 1.2v6.6c0 .66-.54 1.2-1.2 1.2H4.2c-.66 0-1.2-.54-1.2-1.2v-6.6c0-.66.54-1.2 1.2-1.2z',
      'M10.7 3h2.6c.66 0 1.2.54 1.2 1.2v15.6c0 .66-.54 1.2-1.2 1.2h-2.6c-.66 0-1.2-.54-1.2-1.2V4.2c0-.66.54-1.2 1.2-1.2z',
      'M17.2 8h2.6c.66 0 1.2.54 1.2 1.2v10.6c0 .66-.54 1.2-1.2 1.2h-2.6c-.66 0-1.2-.54-1.2-1.2V9.2c0-.66.54-1.2 1.2-1.2z',
    ],
  },
  trophy: {
    d: [
      'M6.8 3h10.4c.44 0 .8.36.8.8V9a6 6 0 0 1-12 0V3.8c0-.44.36-.8.8-.8z',
      'M10.7 14.4h2.6V18h-2.6z',
      'M8.2 17.5h7.6c.66 0 1.2.54 1.2 1.2v1.5c0 .44-.36.8-.8.8H7.8a.8.8 0 0 1-.8-.8v-1.5c0-.66.54-1.2 1.2-1.2z',
    ],
    line: 'M6 5.8H3.8v1.6A3.4 3.4 0 0 0 7 10.8M18 5.8h2.2v1.6a3.4 3.4 0 0 1-3.2 3.4',
    lw: 1.8,
  },
  planet: {
    d: [
      'M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z',
      'M2.484 16.437A10.5 3.8 -25 1 1 21.516 7.563 10.5 3.8 -25 1 1 2.484 16.437zM4.206 15.634A8.6 2.2 -25 1 0 19.794 8.366 8.6 2.2 -25 1 0 4.206 15.634z',
    ],
  },
  clock: { d: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z'], cut: 'M12 7.2V12l3.2 2.1', cw: 2 },
  help: { d: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z'], cut: 'M9.5 9.6a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.1-2.5 3.6M12 17.3v.01', cw: 2.1 },
  sun: {
    d: ['M12 7.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2z'],
    line: 'M12 2.4v1.8M12 19.8v1.8M5.2 5.2l1.3 1.3M17.5 17.5l1.3 1.3M2.4 12h1.8M19.8 12h1.8M5.2 18.8l1.3-1.3M17.5 6.5l1.3-1.3',
    lw: 2,
  },
  moon: { d: ['M20.4 14.7A8.5 8.5 0 1 1 9.3 3.6a7 7 0 0 0 11.1 11.1z'] },
  globe: {
    d: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z'],
    cut: 'M3 12h18M12 2.8c2.5 2.7 3.8 5.8 3.8 9.2s-1.3 6.5-3.8 9.2M12 2.8C9.5 5.5 8.2 8.6 8.2 12s1.3 6.5 3.8 9.2',
    cw: 1.5,
  },
  repeat: {
    d: ['M15.8 2.9l4.2 3.1-4.2 3.1z', 'M8.2 14.9L4 18l4.2 3.1z'],
    line: 'M4.8 11.2V9.6A3.6 3.6 0 0 1 8.4 6H17M19.2 12.8v1.6a3.6 3.6 0 0 1-3.6 3.6H7',
    lw: 2.4,
  },
}

export default function Icon({ name, className = 'h-4 w-4', style, title }: { name: IconName; className?: string; style?: CSSProperties; title?: string }) {
  const maskId = 'ic' + useId().replace(/:/g, '')
  const c = COMPLEX[name]
  const soft = !c && !NO_SOFTEN.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      style={{ verticalAlign: '-0.125em', ...style }}
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {c ? (
        <>
          {c.cut && (
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <rect width="24" height="24" fill="#fff" />
              <path d={c.cut} fill="none" stroke="#000" strokeWidth={c.cw ?? 1.8} strokeLinecap="round" strokeLinejoin="round" />
            </mask>
          )}
          <g mask={c.cut ? `url(#${maskId})` : undefined}>
            {c.d?.map((d, i) => <path key={i} d={d} />)}
            {c.line && <path d={c.line} fill="none" stroke="currentColor" strokeWidth={c.lw ?? 1.8} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        </>
      ) : (
        <path d={PATHS[name as keyof typeof PATHS]} stroke={soft ? 'currentColor' : undefined} strokeWidth={soft ? 1.6 : undefined} strokeLinejoin="round" />
      )}
    </svg>
  )
}

// Metindeki ★ (ör. "★ 8.5" puan) yerine yıldız ikonu — hazır metin üreten yerler (kart bilgileri, geçmiş) için
export function IconText({ text }: { text: string }) {
  if (!text.includes('★')) return <>{text}</>
  const parts = text.split('★')
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <Icon name="star" className="h-[0.95em] w-[0.95em] text-amber-400" />}
          {p}
        </span>
      ))}
    </>
  )
}

// Paylaşılan görsellerde (Flashback hikâyesi, canvas'a çiziliyor) aynı yıldız
export const STAR_PATH = PATHS.star!

export const ICON_NAMES = [...Object.keys(PATHS), ...Object.keys(COMPLEX)] as IconName[]
