import { NavLink } from "react-router-dom";

type Props = { onLogout: () => void };

export default function Nav({ onLogout }: Props) {
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `nav__link${isActive ? " nav__link--active" : ""}`;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <h1>earlybird profit</h1>
        <p>Insights &amp; Automatisierung</p>
      </div>
      <nav>
        <NavLink to="/products" className={linkClassName}>
          Artikel
        </NavLink>
        <NavLink to="/import" className={linkClassName}>
          Rechnungen Import
        </NavLink>
        <NavLink to="/invoice" className={linkClassName}>
          Rechnung erfassen
        </NavLink>
        <NavLink to="/prices" className={linkClassName}>
          Preisentwicklung
        </NavLink>
        <NavLink to="/db" className={linkClassName}>
          Verkaufspreise &amp; DB
        </NavLink>
      </nav>
      <div className="sidebar__footer">
        <button type="button" className="btn btn--ghost sidebar__logout" onClick={onLogout}>
          Logout
        </button>
        <small>Version Beta</small>
      </div>
    </aside>
  );
}
