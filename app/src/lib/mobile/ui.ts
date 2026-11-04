// Telefondaki ARGUS mu? Arayüzün telefona özel düzeni (alt sekme çubuğu, tam ekran pencereler…) buna bakar.
// Sayfa açılırken bir kez belirlenir; PC'deki ARGUS'ta hep false.
import { isMobileApp } from './native'

export const MOBILE = isMobileApp()
