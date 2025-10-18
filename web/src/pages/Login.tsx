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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        background: "linear-gradient(135deg, #eef2ff 0%, #fdf2f8 100%)",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "white",
          padding: "36px",
          borderRadius: "18px",
          boxShadow: "0 24px 48px rgba(15, 23, 42, 0.12)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#111827" }}>Willkommen zurück</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Melden Sie sich mit Ihren Zugangsdaten an.</p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontWeight: 600, color: "#374151" }}>E-Mail</span>
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
            style={{
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              padding: "12px 14px",
              fontSize: "1rem",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = "#6366f1";
              event.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.15)";
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontWeight: 600, color: "#374151" }}>Passwort</span>
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
            style={{
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              padding: "12px 14px",
              fontSize: "1rem",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = "#6366f1";
              event.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.15)";
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          />
        </label>

        {message && (
          <div
            style={{
              borderRadius: "10px",
              padding: "12px 16px",
              background:
                message.tone === "error"
                  ? "rgba(248, 113, 113, 0.12)"
                  : message.tone === "success"
                  ? "rgba(52, 211, 153, 0.12)"
                  : "rgba(96, 165, 250, 0.12)",
              color:
                message.tone === "error"
                  ? "#b91c1c"
                  : message.tone === "success"
                  ? "#047857"
                  : "#1d4ed8",
              fontSize: "0.95rem",
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              border: "none",
              borderRadius: "999px",
              padding: "12px 18px",
              fontWeight: 600,
              fontSize: "1rem",
              cursor: submitting ? "not-allowed" : "pointer",
              background: submitting ? "#9ca3af" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              boxShadow: submitting ? "none" : "0 12px 24px rgba(99, 102, 241, 0.25)",
            }}
            onMouseEnter={(event) => {
              if (submitting) return;
              event.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Anmelden
          </button>
          <button
            type="button"
            onClick={handleSignup}
            disabled={submitting}
            style={{
              flex: 1,
              borderRadius: "999px",
              padding: "12px 18px",
              fontWeight: 600,
              fontSize: "1rem",
              border: "1px solid #6366f1",
              background: "transparent",
              color: "#4f46e5",
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background-color 150ms ease, color 150ms ease",
            }}
            onMouseEnter={(event) => {
              if (submitting) return;
              event.currentTarget.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Registrieren
          </button>
        </div>

        <p className="login-footer">Mit dem Fortfahren akzeptieren Sie unsere Nutzungsbedingungen.</p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#9ca3af", textAlign: "center" }}>
          Mit dem Fortfahren akzeptieren Sie unsere Nutzungsbedingungen.
        </p>
      </form>
    </div>
  );
}
