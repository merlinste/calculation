import { supabase } from "../lib/supabase";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  const login = async (e: any) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setMsg(error ? error.message : "Eingeloggt.");
  };

  const signup = async () => {
    const { error } = await supabase.auth.signUp({ email, password: pw });
    setMsg(error ? error.message : "Registriert – ggf. E-Mail bestätigen.");
  };

  return (
    <form onSubmit={login} style={{maxWidth:360, margin:'6rem auto'}}>
      <h2>Login</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-Mail" style={{width:'100%',margin:'6px 0',padding:8}} />
      <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Passwort" style={{width:'100%',margin:'6px 0',padding:8}} />
      <div style={{display:'flex', gap:8}}>
        <button type="submit">Login</button>
        <button type="button" onClick={signup}>Sign up</button>
      </div>
      {msg && <p>{msg}</p>}
    </form>
  );
}
