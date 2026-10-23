import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { itIT } from "@clerk/localizations";
import { shadcn } from "@clerk/themes";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { ApiError, getMe, getTeam, inviteMember, revokeInvitation, revokeMember, type Account, type Invitation, type Member, type Team } from "./api";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#4f52d9",
    colorForeground: "#1a1b22",
    colorMutedForeground: "#545663",
    colorDanger: "#b4232d",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#1a1b22",
    colorNeutral: "#cfcfd8",
    fontFamily: '"Geist", ui-sans-serif, system-ui, sans-serif',
    borderRadius: "8px",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: {
      width: "100%",
      maxWidth: "440px",
      overflow: "hidden",
      borderRadius: "10px",
      backgroundColor: "#ffffff",
      boxShadow: "0 12px 36px rgb(32 33 54 / 8%)",
    },
    card: { border: "0", borderRadius: "0", backgroundColor: "transparent", boxShadow: "none" },
    footer: { border: "0", borderRadius: "0", backgroundColor: "transparent", boxShadow: "none" },
    headerTitle: { color: "#1a1b22", fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: "600" },
    headerSubtitle: { color: "#545663" },
    socialButtonsBlockButtonText: { color: "#1a1b22", fontWeight: "600" },
    formFieldLabel: { color: "#343540", fontWeight: "600" },
    footerActionLink: { color: "#4144c2", fontWeight: "600" },
    footerActionText: { color: "#545663" },
    dividerText: { color: "#545663" },
    identityPreviewEditButton: { color: "#4144c2" },
    formFieldSuccessText: { color: "#176b43" },
    alertText: { color: "#7f1d24" },
    logoBox: { marginBottom: "10px" },
    logoImage: { maxHeight: "42px" },
    socialButtonsBlockButton: { borderColor: "#d7d7e0", backgroundColor: "#ffffff" },
    formButtonPrimary: { backgroundColor: "#4f52d9", color: "#ffffff", fontWeight: "600" },
    formFieldInput: { borderColor: "#cfcfd8", backgroundColor: "#ffffff", color: "#1a1b22" },
    footerAction: { color: "#545663" },
    dividerLine: { backgroundColor: "#e2e2e8" },
    alert: { borderColor: "#f0cacc", backgroundColor: "#fff7f7" },
    otpCodeFieldInput: { borderColor: "#cfcfd8", color: "#1a1b22" },
    formFieldRow: { color: "#1a1b22" },
    main: { color: "#1a1b22" },
  },
};

function BrandMark({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  return (
    <a className={mobile ? "mobile-brand" : compact ? "portal-brand" : "brand-lockup"} href={basePath || "/"}>
      <img className="brand-logo" src={`${basePath}/logo.svg`} alt="" />
      <span className="brand-word">Regia</span>
    </a>
  );
}

function BrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-label="Regia, workspace Performetrica">
      <BrandMark />
      <div className="brand-message">
        <span className="brand-overline">Performetrica · spazio di lavoro</span>
        <h1>Il lavoro di oggi, in ordine.</h1>
        <p>Regia raccoglie attività, priorità e persone in un unico spazio operativo per il team.</p>
      </div>
      <div className="brand-footer">Accesso riservato al team invitato</div>
    </aside>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-stage">
      <BrandPanel />
      <section className="auth-main">
        <BrandMark mobile />
        <div className="auth-content">{children}</div>
      </section>
    </main>
  );
}

function Home() {
  return (
    <AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">Regia · Performetrica</span>
        <h2>Una giornata più chiara comincia qui.</h2>
        <p>Accedi al tuo spazio di lavoro per ritrovare le attività e le priorità del team.</p>
      </div>
      <a className="primary-link" href={`${basePath}/sign-in`}>
        Accedi al workspace <span aria-hidden="true">→</span>
      </a>
      <div className="welcome-meta">
        <span className="welcome-meta-mark" aria-hidden="true" />
        <span>Regia è riservata alle persone invitate da un amministratore Performetrica.</span>
      </div>
      <p className="privacy-note">I dati di lavoro e le preferenze dell’app restano su questo browser.</p>
    </AuthLayout>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/user-portal" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

function SignInPage() {
  return (
    <>
    <Show when="signed-in"><Redirect to="/user-portal" /></Show>
    <Show when="signed-out"><AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">Accesso al team</span>
        <h2>Bentornato in Regia.</h2>
        <p>Usa l’indirizzo email associato al tuo invito Performetrica.</p>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        withSignUp={false}
        appearance={{ elements: { footerAction: { display: "none" } } }}
      />
    </AuthLayout></Show>
    </>
  );
}

function InvitationRequired() {
  return (
    <AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">Accesso su invito</span>
        <h2>Questo spazio è riservato.</h2>
        <p>Gli account Regia vengono attivati dal team Performetrica, non è possibile registrarsi liberamente.</p>
      </div>
      <div className="notice-card">
        <h3>Hai ricevuto un invito?</h3>
        <p>Apri il link personale ricevuto via email per completare l’attivazione. Se il link non è disponibile, chiedi a un amministratore di inviartene uno nuovo.</p>
        <a className="text-link" href={`${basePath}/sign-in`}>Ho già un account · Accedi</a>
      </div>
      <p className="privacy-note">Gli inviti possono essere inviati solo dagli amministratori del workspace.</p>
    </AuthLayout>
  );
}

function SignUpPage() {
  const routePath = stripBase(window.location.pathname);
  const isClerkSubpath = routePath.startsWith("/sign-up/") && routePath.length > "/sign-up/".length;
  const hasInvitationTicket = new URLSearchParams(window.location.search).has("__clerk_ticket");
  if (!hasInvitationTicket && !isClerkSubpath) return <InvitationRequired />;

  return (
    <AuthLayout>
      <div className="auth-heading">
        <span className="eyebrow">Invito Performetrica</span>
        <h2>Completa il tuo accesso.</h2>
        <p>Conferma i tuoi dati per entrare nello spazio Regia del team.</p>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthLayout>
  );
}

type AccessState =
  | { kind: "loading" }
  | { kind: "allowed"; user: Account }
  | { kind: "denied"; invitationRequired: boolean }
  | { kind: "error"; message: string };

function useAccountAccess() {
  const { signOut } = useClerk();
  const [state, setState] = useState<AccessState>({ kind: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const requestVersion = useRef(0);

  const checkAccess = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await getMe();
      if (requestVersion.current === version) setState({ kind: "allowed", user: response.user });
    } catch (error) {
      if (requestVersion.current !== version) return;
      if (error instanceof ApiError && error.status === 401) {
        setState({ kind: "denied", invitationRequired: false });
        void signOut({ redirectUrl: basePath || "/" });
      } else if (error instanceof ApiError && error.status === 403) {
        setState({ kind: "denied", invitationRequired: error.code === "INVITATION_REQUIRED" });
      } else {
        setState({ kind: "error", message: error instanceof Error ? error.message : "Non è stato possibile verificare l’accesso." });
      }
    }
  }, [signOut]);

  useEffect(() => {
    void checkAccess();
    const interval = window.setInterval(() => void checkAccess(), 30_000);
    const onFocus = () => void checkAccess();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      requestVersion.current += 1;
    };
  }, [checkAccess]);

  const logout = useCallback(() => {
    setLoggingOut(true);
    void signOut({ redirectUrl: basePath || "/" });
  }, [signOut]);

  return { state, checkAccess, loggingOut, logout };
}

function LoadingCard() {
  return (
    <div className="status-card" aria-label="Verifica dell’accesso in corso" aria-busy="true">
      <div className="loading-lines">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

function AccessCard({ state, retry }: { state: AccessState; retry: () => void }) {
  if (state.kind === "loading") return <LoadingCard />;
  if (state.kind === "denied") {
    return (
      <div className="status-card" role="status">
        <h1>{state.invitationRequired ? "Serve un invito." : "Accesso non disponibile."}</h1>
        <p>{state.invitationRequired
          ? "Il tuo account non è associato a un invito attivo. Contatta un amministratore del team Performetrica."
          : "La sessione non è più attiva. Accedi di nuovo per continuare."}</p>
        <button className="primary-button" type="button" onClick={retry}>Verifica di nuovo</button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="status-card" role="alert">
        <h1>Verifica non riuscita.</h1>
        <p>{state.message}</p>
        <button className="primary-button" type="button" onClick={retry}>Riprova</button>
      </div>
    );
  }
  return null;
}

function PortalHeader({ user, onLogout }: { user: Account; onLogout: () => void }) {
  return (
    <header className="portal-header">
      <BrandMark compact />
      <nav className="portal-tools" aria-label="Navigazione workspace">
        <span className="portal-identity">{user.name || user.email}</span>
        {user.isAdmin && <a className="quiet-button" href={`${basePath}/team`}>Gestisci team</a>}
        <button className="quiet-button" type="button" onClick={onLogout}>Esci</button>
      </nav>
    </header>
  );
}

function UserPortalPage() {
  const { state, checkAccess, loggingOut, logout } = useAccountAccess();
  const canShowWorkspace = state.kind === "allowed" && !loggingOut;

  return (
    <main className="portal">
      {state.kind === "allowed" ? <PortalHeader user={state.user} onLogout={logout} /> :
        <header className="portal-header">
          <BrandMark compact />
          <button className="quiet-button" type="button" onClick={logout} disabled={loggingOut}>Esci</button>
        </header>}
      {canShowWorkspace
        ? <div className="portal-frame-wrap"><iframe className="portal-frame" src="/workspace" title="Workspace Regia" /></div>
        : <div className="portal-status"><AccessCard state={loggingOut ? { kind: "loading" } : state} retry={checkAccess} /></div>}
    </main>
  );
}

function TeamPage() {
  const { state, checkAccess, loggingOut, logout } = useAccountAccess();
  if (state.kind !== "allowed") {
    return <TeamAccessStatus state={loggingOut ? { kind: "loading" } : state} retry={checkAccess} onLogout={logout} />;
  }
  return state.user.isAdmin
    ? <TeamManagement user={state.user} onLogout={logout} />
    : <TeamDenied user={state.user} onLogout={logout} />;
}

function TeamAccessStatus({ state, retry, onLogout }: { state: AccessState; retry: () => void; onLogout: () => void }) {
  if (state.kind === "allowed") return null;
  return (
    <main className="team-page">
      <header className="portal-header">
        <BrandMark compact />
        <button className="quiet-button" type="button" onClick={onLogout}>Esci</button>
      </header>
      <div className="portal-status"><AccessCard state={state} retry={retry} /></div>
    </main>
  );
}

function TeamDenied({ user, onLogout }: { user: Account; onLogout: () => void }) {
  return (
    <main className="team-page">
      <PortalHeader user={user} onLogout={onLogout} />
      <div className="portal-status">
        <div className="status-card" role="alert">
          <h1>Gestione riservata.</h1>
          <p>Solo gli amministratori possono gestire inviti e membri del team.</p>
          <a className="quiet-button" href={`${basePath}/user-portal`}>Torna al workspace</a>
        </div>
      </div>
    </main>
  );
}

function initials(name: string, email: string) {
  const source = name.trim() || email;
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function TeamManagement({ user, onLogout }: { user: Account; onLogout: () => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTeam(await getTeam());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout();
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setLoadError(error.code === "INVITATION_REQUIRED"
          ? "Questo account non ha accesso al team."
          : "Non hai i permessi per visualizzare il team.");
      } else {
        setLoadError(error instanceof Error ? error.message : "Impossibile caricare i dati del team.");
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, refreshKey]);

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFeedback({ kind: "error", text: "Inserisci un indirizzo email valido." });
      return;
    }
    setSaving(true);
    try {
      const response = await inviteMember(normalizedEmail);
      setFeedback({ kind: "success", text: response.message });
      setEmail("");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout();
      } else {
        setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Invito non riuscito." });
      }
    } finally {
      setSaving(false);
    }
  };

  const onRevokeInvitation = async (invitation: Invitation) => {
    if (!window.confirm(`Revocare l’invito per ${invitation.email}?`)) return;
    setFeedback(null);
    try {
      const response = await revokeInvitation(invitation.id);
      setFeedback({ kind: "success", text: response.message });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout();
      else setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Impossibile revocare l’invito." });
    }
  };

  const onRevokeMember = async (member: Member) => {
    if (!window.confirm(`Rimuovere ${member.name || member.email} dal team?`)) return;
    setFeedback(null);
    try {
      const response = await revokeMember(member.id);
      setFeedback({ kind: "success", text: response.message });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout();
      else setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Impossibile rimuovere il membro." });
    }
  };

  return (
    <main className="team-page">
      <PortalHeader user={user} onLogout={onLogout} />
      <div className="team-main">
        <div className="team-title">
          <span className="eyebrow">Amministrazione · Performetrica</span>
          <h1>Persone e inviti</h1>
          <p>Gestisci chi può accedere allo spazio operativo Regia.</p>
        </div>

        <section className="team-section" aria-labelledby="invite-heading">
          <div className="section-head">
            <div>
              <h2 id="invite-heading">Invita una persona</h2>
              <p>Gli inviti sono riservati al team Performetrica.</p>
            </div>
          </div>
          <form className="invite-form" onSubmit={onInvite} noValidate>
            <div className="field">
              <label htmlFor="invite-email">Email di lavoro</label>
              <input
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder="nome@performetrica.it"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                disabled={saving}
                required
              />
            </div>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Invio in corso…" : "Invia invito"}
            </button>
          </form>
          {feedback && <div className={`feedback${feedback.kind === "error" ? " error" : ""}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</div>}
        </section>

        <section className="team-section" aria-labelledby="members-heading">
          <div className="section-head">
            <div>
              <h2 id="members-heading">Membri del team</h2>
              <p>Persone con accesso attivo.</p>
            </div>
          </div>
          {loading && !team
            ? <div className="empty-list" aria-busy="true">Caricamento membri…</div>
            : loadError
              ? <div className="team-error" role="alert"><span>{loadError}</span><button className="small-button" type="button" onClick={() => void load()}>Riprova</button></div>
              : team?.members.length
                ? team.members.map((member) => (
                  <div className="list-row" key={member.id}>
                    <div className="person-mark" aria-hidden="true">{initials(member.name, member.email)}</div>
                    <div className="person-copy">
                      <div className="person-name">{member.name || member.email}</div>
                      {member.name && <div className="person-email">{member.email}</div>}
                    </div>
                    <span className="role-chip">{member.role === "admin" ? "Amministratore" : "Membro"}</span>
                    {member.id !== user.id && <button className="row-action" type="button" onClick={() => void onRevokeMember(member)}>Rimuovi</button>}
                  </div>
                ))
                : <div className="empty-list">Nessun membro da mostrare.</div>}
        </section>

        <section className="team-section" aria-labelledby="pending-heading">
          <div className="section-head">
            <div>
              <h2 id="pending-heading">Inviti in attesa</h2>
              <p>Inviti non ancora completati.</p>
            </div>
          </div>
          {loading && !team
            ? <div className="empty-list" aria-busy="true">Caricamento inviti…</div>
            : loadError
              ? <div className="empty-list">Riprova a caricare i dati per vedere gli inviti.</div>
              : team?.invitations.length
                ? team.invitations.map((invitation) => (
                  <div className="list-row" key={invitation.id}>
                    <div className="person-mark" aria-hidden="true">@</div>
                    <div className="person-copy">
                      <div className="person-name">{invitation.email}</div>
                      <div className="person-email">
                        {invitation.status} · {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(invitation.createdAt))}
                      </div>
                    </div>
                    <span className="pending-chip">In attesa</span>
                    <button className="row-action" type="button" onClick={() => void onRevokeInvitation(invitation)}>Revoca</button>
                  </div>
                ))
                : <div className="empty-list">Non ci sono inviti in attesa.</div>}
        </section>
        <p className="privacy-note">Le attività e le preferenze dell’app restano su questo browser. La gestione degli inviti non sincronizza i dati di lavoro tra membri.</p>
      </div>
    </main>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/user-portal`}
      signUpFallbackRedirectUrl={`${basePath}/user-portal`}
      localization={itIT}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/user-portal">
          <Show when="signed-in"><UserPortalPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route path="/team">
          <Show when="signed-in"><TeamPage /></Show>
          <Show when="signed-out"><Redirect to="/" /></Show>
        </Route>
        <Route><Redirect to="/" /></Route>
      </Switch>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
