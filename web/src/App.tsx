import { Outlet, Link, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Nav from "./components/Nav";
import { useEffect, useState } from "react";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!user) {
    return (
      <div style={{padding:16}}>
        <h1>earlybird profit</h1>
        <p><Link to="/login">Bitte einloggen</Link></p>
      </div>
    );
  }

  const logout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  return (
    <div style={{display:'grid', gridTemplateColumns:'220px 1fr', minHeight:'100vh'}}>
      <Nav onLogout={logout} />
      <main style={{padding:20}}>
        <Outlet />
      </main>
    </div>
  );
}
