import { NavLink } from "react-router-dom";

export default function Nav({ onLogout }: { onLogout: ()=>void }) {
  const linkStyle = ({ isActive }: any) => ({
    display:'block', padding:'10px 14px',
    background: isActive ? '#eef' : 'transparent',
    textDecoration:'none'
  });
  return (
    <aside style={{borderRight:'1px solid #ddd', padding:12}}>
      <h3>earlybird</h3>
      <nav>
        <NavLink to="/products" style={linkStyle}>Artikel</NavLink>
        <NavLink to="/import" style={linkStyle}>Rechnungen Import</NavLink>
        <NavLink to="/prices" style={linkStyle}>Preisentwicklung</NavLink>
        <NavLink to="/db" style={linkStyle}>Verkaufspreise & DB</NavLink>
      </nav>
      <button onClick={onLogout} style={{marginTop:12}}>Logout</button>
    </aside>
  );
}
