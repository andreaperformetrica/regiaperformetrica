import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Header, useSession } from "./App";
import { getTeam, inviteMember, revokeMember, revokeInvitation, type Team } from "./api";

export default function TeamPage() {
  const {user,refresh}=useSession();
  const [team,setTeam]=useState<Team|null>(null),[email,setEmail]=useState("");
  const [message,setMessage]=useState(""),[error,setError]=useState(""),[link,setLink]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{setTeam(await getTeam());setError("");}
    catch(e){setError(e instanceof Error?e.message:"Impossibile caricare il team.");await refresh();}
  },[refresh]);
  useEffect(()=>{if(user?.isAdmin)void load();},[load,user?.isAdmin]);
  async function invite(target:string) {
    setBusy(true);setError("");setMessage("");setLink("");
    try{const result=await inviteMember(target);setMessage(result.message);setLink(location.origin+result.invitationPath);setEmail("");await load();}
    catch(e){setError(e instanceof Error?e.message:"Operazione non riuscita.");}
    finally{setBusy(false);}
  }
  async function revoke(id:string,kind:"member"|"invite") {
    if(!confirm(kind==="member"?"Revocare l’accesso e tutte le sessioni di questa persona?":"Revocare questo invito?"))return;
    setBusy(true);setLink("");
    try{const result=await(kind==="member"?revokeMember(id):revokeInvitation(id));setMessage(result.message);await load();}
    catch(e){setError(e instanceof Error?e.message:"Operazione non riuscita.");}
    finally{setBusy(false);}
  }
  async function submit(e:FormEvent){e.preventDefault();await invite(email);}
  if(!user?.isAdmin)return <main className="team-page"><Header/><div className="portal-status"><p>Gestione riservata al super admin.</p></div></main>;
  return <main className="team-page"><Header/><div className="team-main">
    <div className="team-title"><span className="eyebrow">Amministrazione</span><h1>Persone e inviti</h1><p>Crea un link per i colleghi. Ognuno sceglie la propria password.</p></div>
    <section className="team-section"><h2>Invita una persona</h2>
      <form className="invite-form" onSubmit={submit}><div className="field"><label htmlFor="invite-email">Email</label>
        <input id="invite-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div>
        <button className="primary-button" disabled={busy}>{busy?"Creazione…":"Crea invito"}</button></form>
      <p className="privacy-note">I link durano 7 giorni e si usano una sola volta. Nessuna email viene inviata automaticamente. Rigenerare un link invalida quello precedente.</p>
      {message&&<p role="status" className="feedback">{message}</p>}
      {error&&<p role="alert" className="feedback error">{error}</p>}
      {link&&<div className="invitation-link"><label htmlFor="invite-link">Link da condividere in privato</label>
        <input id="invite-link" readOnly value={link} onFocus={e=>e.target.select()}/>
        <button className="small-button" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage("Link copiato.");}catch{setMessage("Seleziona il link e copialo manualmente.");}}}>Copia link</button></div>}
    </section>
    <section className="team-section"><h2>Membri del team</h2>
      {!team?<button className="small-button" onClick={()=>void load()}>Carica membri</button>:team.members.map(member=><div className="list-row" key={member.id}>
        <div className="person-copy"><div className="person-name">{member.name||member.email}</div>{member.name&&<div className="person-email">{member.email}</div>}</div>
        <span className="role-chip">{member.role==="super_admin"?"Super admin":"Membro"}</span>
        {member.role!=="super_admin"&&<><button disabled={busy} className="row-action" onClick={()=>void invite(member.email)}>Reimposta password</button>
          <button disabled={busy} className="row-action" onClick={()=>void revoke(member.id,"member")}>Revoca accesso</button></>}
      </div>)}
    </section>
    <section className="team-section"><h2>Inviti in attesa</h2>
      {team?.invitations.length?team.invitations.map(item=><div className="list-row" key={item.id}><div className="person-copy"><div className="person-name">{item.email}</div><div className="person-email">Link attivo · {new Date(item.createdAt).toLocaleDateString("it-IT")}</div></div>
        <button className="row-action" disabled={busy} onClick={()=>void invite(item.email)}>Nuovo link</button>
        <button className="row-action" disabled={busy} onClick={()=>void revoke(item.id,"invite")}>Revoca</button></div>):<p className="empty-list">Nessun invito in attesa.</p>}
    </section><p className="privacy-note">Le attività sono ancora locali: gli inviti non sincronizzano i dati tra persone o dispositivi.</p>
  </div></main>;
}
