import { NavLink } from "react-router-dom";
import logo from "../assets/earlybird-logo.svg";

type Props = { onLogout: () => void };

export default function Nav({ onLogout }: Props) {
  const linkClassName = ({ isActive }: { isActive: boolean }) => `nav__link${isActive ? " nav__link--active" : ""}`;

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
        <NavLink to="/products" className={linkClassName}>
          Produkte
        </NavLink>
        <NavLink to="/import" className={linkClassName}>
          Import
        </NavLink>
        <NavLink to="/invoice" className={linkClassName}>
          Rechnung erfassen
        </NavLink>
        <NavLink to="/prices" className={linkClassName}>
          Preisentwicklung
        </NavLink>
        <NavLink to="/db" className={linkClassName}>
          Deckungsbeiträge
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
