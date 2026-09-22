import { NavLink, Outlet } from 'react-router-dom'
import { AppBarComponent } from '@syncfusion/ej2-react-navigations'
import { ButtonComponent } from '@syncfusion/ej2-react-buttons'
import {
  LayoutDashboard,
  FileText,
  LayoutTemplate,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
]

export function AppShell() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell">
      <AppBarComponent colorMode="Inherit" cssClass="app-shell__bar">
        <div className="app-shell__brand">
          <span className="app-shell__brand-mark">S</span>
          SignFlow
        </div>

        <nav className="app-shell__nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `app-shell__nav-item${isActive ? ' app-shell__nav-item--active' : ''}`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="e-appbar-spacer" />
        <ButtonComponent cssClass="e-inherit app-shell__icon-btn" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </ButtonComponent>
      </AppBarComponent>

      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  )
}
