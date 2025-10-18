import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Message = { text: string; tone: "error" | "info" | "success" } | null;

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => {
    const state = location.state as { from?: string } | string | null;
    const candidate = typeof state === "string" ? state : state?.from;
    return candidate && candidate !== "/login" ? candidate : "/products";
  }, [location.state]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        navigate(redirectTo, { replace: true });
      }
    });
  }, [navigate, redirectTo]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      setMessage({ text: error.message, tone: "error" });
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    navigate(redirectTo, { replace: true });
  };

  const handleSignup = async () => {
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) {
      setMessage({ text: error.message, tone: "error" });
    } else {
      setMessage({ text: "Registriert – bitte Posteingang bestätigen.", tone: "success" });
    }
    setSubmitting(false);
  };

  const calloutTone = message?.tone === "error" ? "callout--danger" : message?.tone === "success" ? "callout--success" : "";

  return (
    <div className="login-layout">
      <form className="login-card" onSubmit={handleLogin}>
        <header>
          <h1>Willkommen zurück</h1>
          <p>Melden Sie sich mit Ihren Zugangsdaten an, um weiterzuarbeiten.</p>
        </header>

        <label>
          <span>E-Mail</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@firma.de"
            type="email"
            required
            autoComplete="username"
          />
        </label>

        <label>
          <span>Passwort</span>
          <input
            type="password"
            value={pw}
            onChange={(event) => setPw(event.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </label>

        {message && <div className={`callout ${calloutTone}`}>{message.text}</div>}

        <div className="login-actions">
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Wird geprüft…" : "Anmelden"}
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleSignup} disabled={submitting}>
            Registrieren
          </button>
        </div>

        <p className="login-footer">Mit dem Fortfahren akzeptieren Sie unsere Nutzungsbedingungen.</p>
      </form>
    </div>
  );
}
