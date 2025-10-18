import { Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Nav from "./components/Nav";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const targetAfterLogin = useMemo(
    () => location.pathname + location.search + location.hash,
    [location.hash, location.pathname, location.search],
  );

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        setUser(error ? null : data.user);
      })
      .finally(() => setInitialising(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (initialising) {
    return (
      <div className="login-layout">
        <div className="login-card">
          <header>
            <h1>Bitte einen Moment</h1>
            <p>Wir prüfen die aktuelle Sitzung…</p>
          </header>
        </div>
      </div>
    );
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: targetAfterLogin }} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: targetAfterLogin }} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: targetAfterLogin }} />;
  }

  const logout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  return (
    <div className="app-shell">
      <Nav onLogout={logout} />
      <main className="main-region">
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
