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
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: targetAfterLogin }} />;
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
