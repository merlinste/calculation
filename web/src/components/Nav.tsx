import { NavLink, useLocation } from "react-router-dom";
import logo from "../assets/earlybird-logo.svg";

type Props = { onLogout: () => void };

export default function Nav({ onLogout }: Props) {
  const location = useLocation();
  const linkClassName = ({ isActive }: { isActive: boolean }) => `nav__link${isActive ? " nav__link--active" : ""}`;
  const importActive = ["/import", "/invoice", "/products", "/suppliers"].some((path) => location.pathname.startsWith(path));

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="brand-logo" src={logo} alt="earlybird Calculation" />
        <div className="brand-meta">
          <strong>earlybird Calculation</strong>
          <span>Kalkulationstool</span>
        </div>
      </div>
      <nav className="topbar__nav" aria-label="Hauptnavigation">
        <div className="nav__dropdown">
          <button
            type="button"
            className={`nav__link nav__link--summary${importActive ? " nav__link--active" : ""}`}
            aria-haspopup="true"
          >
            Import
          </button>
          <div className="nav__dropdown-menu" role="menu">
            <NavLink to="/import" className={linkClassName}>
              Import
            </NavLink>
            <NavLink to="/invoice" className={linkClassName}>
              Rechnungserfassung
            </NavLink>
            <NavLink to="/products" className={linkClassName}>
              Produkte
            </NavLink>
            <NavLink to="/suppliers" className={linkClassName}>
              Lieferanten
            </NavLink>
          </div>
        </div>
        <NavLink to="/prices" className={linkClassName}>
          Preisentwicklung
        </NavLink>
        <NavLink to="/db" className={linkClassName}>
          Szenario-Analyse
        </NavLink>
      </nav>
      <div className="topbar__actions">
        <span className="topbar__status">Beta-Version</span>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Abmelden
        </button>
      </div>
    </header>
  );
}
