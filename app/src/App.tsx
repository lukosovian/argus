import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ProfilesProvider, useProfiles } from './hooks/useProfiles'
import { ToastProvider } from './hooks/useToast'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import Navbar from './components/Navbar'
import ProfilePicker from './components/ProfilePicker'
import AnaSayfa from './pages/AnaSayfa'
import Boards from './pages/Boards'
import BoardView from './pages/BoardView'
import YardimMerkezi from './pages/YardimMerkezi'
import Istatistikler from './pages/Istatistikler'
import YamaNotlari from './pages/YamaNotlari'

// Bir profil ilk kez aktif olduğunda (o profil daha önce hiç görmediyse) Yardım Merkezi'ni
// otomatik açar — "ilk girişte gelsin" isteği. `localStorage`'da profil başına bir bayrak
// tutuyoruz (sekme/tarayıcı kapansa da kalıcı olsun, tekrar tekrar açılmasın); bayrak
// NAVİGASYONDAN ÖNCE set ediliyor, yani kullanıcı sayfayı hemen terk etse bile bir daha
// zorla açılmaz — sadece pp menüsünden istediği an manuel ulaşabilir.
const HELP_SEEN_PREFIX = 'argus_help_seen_'

function useAutoShowHelpOnce() {
  const { loading, activeProfile } = useProfiles()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (loading || !activeProfile || location.pathname === '/yardim') return
    const key = HELP_SEEN_PREFIX + activeProfile.id
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      return // localStorage kapalı/dolu olabilir — sorun değil, sadece zorla açılmaz
    }
    navigate('/yardim?ilk=1')
  }, [loading, activeProfile, location.pathname, navigate])
}

function Shell({ children }: { children: React.ReactNode }) {
  // Netflix'teki "kim izliyor" ekranı gibi: aktif bir profil seçilmeden (ya da hiç profil
  // yokken ilk kurulumda) uygulamanın geri kalanı açılmaz, bu ekran zorunlu bir kapı olur.
  const { loading, activeProfile } = useProfiles()
  useAutoShowHelpOnce()
  useUpdateCheck()
  return (
    <>
      <Navbar />
      {!loading && !activeProfile && <ProfilePicker />}
      {children}
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell>
            <AnaSayfa />
          </Shell>
        }
      />
      <Route
        path="/arsivlerim"
        element={
          <Shell>
            <Boards />
          </Shell>
        }
      />
      <Route
        path="/board/:id"
        element={
          <Shell>
            <BoardView />
          </Shell>
        }
      />
      <Route
        path="/yardim"
        element={
          <Shell>
            <YardimMerkezi />
          </Shell>
        }
      />
      <Route
        path="/istatistikler"
        element={
          <Shell>
            <Istatistikler />
          </Shell>
        }
      />
      <Route
        path="/yama-notlari"
        element={
          <Shell>
            <YamaNotlari />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ProfilesProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-neutral-950">
            <AppRoutes />
          </div>
        </BrowserRouter>
      </ProfilesProvider>
    </ToastProvider>
  )
}
