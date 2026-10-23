import { createContext, useContext, useCallback, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { ApiError, getMe, login, logout, activate, changePassword, type Account } from "./api";
import TeamPage from "./TeamPage";

type Session = {
  user: Account | null; loading: boolean; error: string; leaving: boolean;
  refresh: () => Promise<void>; signOut: () => Promise<void>;
};
const SessionContext = createContext<Session>(null!);
export const useSession = () => useContext(SessionContext);

export function Brand() {
  return <a className="portal-brand" href="/"><img className="brand-logo" src="/logo.svg" alt="" /><span className="brand-word">Regia</span></a>;
}
function Layout({ children }: {children: ReactNode}) {
  return <main className="auth-stage">
    <aside className="auth-brand-panel">
      <Brand />
      <div className="brand-message"><span className="brand-overline">Performetrica · spazio di lavoro</span>
        <h1>Il lavoro di oggi,<br />in ordine.</h1>
        <p>Attività, priorità e persone. Il tuo spazio operativo, senza complicazioni.</p>
      </div><div className="brand-footer">Accesso riservato al team invitato</div>
    </aside>
    <section className="auth-main"><div className="mobile-brand"><Brand /></div><div className="auth-content">{children}</div></section>
  </main>;
}
export function Header() {
  const {user, signOut, leaving} = useSession();
  return <header className="portal-header"><Brand /><nav className="portal-tools" aria-label="Account">
    <a className="quiet-button" href="/user-portal">Workspace</a>
    {user?.isAdmin && <a className="quiet-button" href="/team">Gestisci team</a>}
    <a className="quiet-button" href="/password">Password</a>
    <button className="quiet-button" disabled={leaving} onClick={() => void signOut()}>Esci</button>
  </nav></header>;
}
function SignIn() {
  const {user, refresh} = useSession();
  const [, navigate] = useLocation();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [show,setShow] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  if (user) return <Redirect to="/user-portal" />;
  async function submit(event:FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await login(email,password); setPassword(""); await refresh(); navigate("/user-portal"); }
    catch (e) { setError(e instanceof Error ? e.message : "Accesso non riuscito."); }
    finally { setBusy(false); }
  }
  return <Layout><div className="auth-heading"><span className="eyebrow">Accesso al team</span>
    <h2>Bentornato in Regia.</h2><p>Inserisci la tua email e la tua password.</p></div>
    {new URLSearchParams(location.search).has("saved") && <p className="feedback" role="status">Password salvata. Ora puoi accedere.</p>}
    <form className="login-form" onSubmit={submit}>
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" type={show?"text":"password"} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></div>
      <label className="show-password"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Mostra password</label>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy}>{busy?"Accesso in corso…":"Accedi"}</button>
    </form>
    <p className="privacy-note">Non ricordi la password? Chiedi al super admin un nuovo link di accesso.</p>
    <p className="privacy-note">Solo su invito. Le attività restano salvate in questo browser.</p>
  </Layout>;
}
function PasswordPage({invitation=false}:{invitation?:boolean}) {
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  const [,navigate] = useLocation();
  const [name,setName]=useState(""),[old,setOld]=useState(""),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const {refresh}=useSession();
  async function submit(e:FormEvent) {
    e.preventDefault(); setError("");
    if(password!==confirmation){setError("Le password non coincidono.");return;}
    setBusy(true);
    try {
      if(invitation) await activate(token,password,name);
      else await changePassword(old,password);
      setPassword("");setOld("");setConfirmation("");
      history.replaceState(null,"","/sign-in?saved=1");
      await refresh(); navigate("/sign-in?saved=1");
    } catch(e){setError(e instanceof Error?e.message:"Operazione non riuscita.");}
    finally{setBusy(false);}
  }
  if(invitation&&!/^[a-f0-9]{64}$/.test(token)) return <Layout><div className="auth-heading"><h2>Serve un invito.</h2>
    <p>Apri il link ricevuto dal super admin per impostare la tua password.</p></div><a className="primary-link" href="/sign-in">Torna all’accesso</a></Layout>;
  return <Layout><div className="auth-heading"><span className="eyebrow">Regia · account</span><h2>{invitation?"Scegli la tua password.":"Cambia password."}</h2>
    <p>Usa almeno 12 caratteri. Puoi scegliere una frase facile da ricordare.</p></div>
    <form className="login-form" onSubmit={submit}>
      {invitation?<div className="field"><label htmlFor="name">Nome (facoltativo)</label><input id="name" autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></div>:
        <div className="field"><label htmlFor="old">Password attuale</label><input id="old" type="password" required autoComplete="current-password" value={old} maxLength={128} onChange={e=>setOld(e.target.value)}/></div>}
      <div className="field"><label htmlFor="new">Nuova password</label><input id="new" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></div>
      <div className="field"><label htmlFor="confirm">Conferma password</label><input id="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div>
      {error&&<p role="alert" className="feedback error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy?"Salvataggio…":"Salva password"}</button>
    </form><p className="privacy-note">{invitation?"Il link funziona una sola volta.":"Dopo il cambio password dovrai accedere nuovamente."}</p>
    <a className="text-link" href={invitation?"/sign-in":"/user-portal"}>Torna indietro</a>
  </Layout>;
}
function Protected({children}:{children:ReactNode}) {
  const {user,error,leaving}=useSession();
  if(leaving)return <p className="portal-status">Disconnessione…</p>;
  if(error)return <Layout><p role="alert" className="feedback error">{error}</p><button className="primary-button" onClick={()=>location.reload()}>Riprova</button></Layout>;
  return user?<>{children}</>:<Redirect to="/sign-in"/>;
}
function Portal() {
  return <main className="portal"><Header/><div className="portal-frame-wrap"><iframe className="portal-frame" src="/workspace" title="Workspace Regia"/></div></main>;
}
export default function App() {
  const [user,setUser]=useState<Account|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[leaving,setLeaving]=useState(false);
  const [,navigate]=useLocation();
  const refresh=useCallback(async()=>{
    try{const result=await getMe();setUser(result.user);setError("");}
    catch(e){if(e instanceof ApiError&&e.status===401){setUser(null);setError("");}else{setUser(null);setError("Impossibile verificare la sessione. Riprova tra poco.");}}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);const focus=()=>void refresh();window.addEventListener("focus",focus);
    return()=>{clearInterval(timer);window.removeEventListener("focus",focus);};},[refresh]);
  const signOut=async()=>{
    setLeaving(true);
    try{await logout();setUser(null);setError("");navigate("/sign-in");}
    catch{setError("Disconnessione non riuscita. Riprova.");}
    finally{setLeaving(false);}
  };
  return <SessionContext.Provider value={{user,loading,error,leaving,refresh,signOut}}>
    {loading?<div className="portal-status" role="status">Caricamento Regia…</div>:
    <Switch>
      <Route path="/"><SignIn/></Route><Route path="/sign-in"><SignIn/></Route>
      <Route path="/sign-up"><PasswordPage invitation/></Route>
      <Route path="/password"><Protected><PasswordPage/></Protected></Route>
      <Route path="/user-portal"><Protected><Portal/></Protected></Route>
      <Route path="/team"><Protected><TeamPage/></Protected></Route>
      <Route><Redirect to="/sign-in"/></Route>
    </Switch>}
  </SessionContext.Provider>;
}
