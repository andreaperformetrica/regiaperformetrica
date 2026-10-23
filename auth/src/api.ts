export type Account = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export type Member = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
};

export type Invitation = {
  id: string;
  email: string;
  status: string;
  createdAt: number;
};

export type Team = {
  members: Member[];
  invitations: Invitation[];
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error || "Operazione non riuscita.", response.status, body.code);
  return body;
}

export const getMe = () => request<{ user: Account }>("/api/me");
export const getTeam = () => request<Team>("/api/team");
export const inviteMember = (email: string) =>
  request<{ message: string }>("/api/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
export const revokeInvitation = (id: string) =>
  request<{ message: string }>(`/api/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const revokeMember = (id: string) =>
  request<{ message: string }>(`/api/members/${encodeURIComponent(id)}`, { method: "DELETE" });
