export type RemoteSystem = {
  id: string;
  family: string;
  name: string;
  version: string;
  like: string[];
  detectedAt: string;
};
export type Host = {
  id: string;
  name: string;
  address: string;
  port: number;
  username: string;
  group: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  auth: "password" | "key" | "agent";
  jumpId: string;
  color: "mint" | "blue" | "amber" | "violet";
  system?: RemoteSystem;
  hasPassword?: boolean;
  hasKey?: boolean;
  hasPassphrase?: boolean;
};
export type HostInput = Omit<Host, "id"> & {
  id?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  clearSecret?: boolean;
};
export type Snippet = { id: string; name: string; command: string };
export type Session = {
  kind?: "local" | "ssh";
  shell?: string;
  cwd?: string;
  hostname?: string;
  id: string;
  hostId: string;
  name: string;
  status: "connecting" | "ready" | "closed";
  mode: "terminal" | "sftp";
  error?: string;
  details?: string;
  code?: string;
};
export type RemoteFile = {
  name: string;
  size: number;
  mode: number;
  modified: number;
  directory: boolean;
  symlink: boolean;
};
export type Transfer = {
  id: string;
  sessionId: string;
  direction: string;
  name: string;
  size: number;
  transferred: number;
  status: string;
  message?: string;
};
export type Prompt = {
  id: string;
  title: string;
  description: string;
  fields: { label: string; secret: boolean }[];
};
export type AppState = {
  hosts: Host[];
  snippets: Snippet[];
  knownHosts: Record<string, string>;
  settings: {
    fontSize: number;
    language: "en" | "ru" | "kk";
    pinLock: { enabled: boolean; idleMinutes: number };
  };
  sessions: Session[];
  version: string;
  platform: string;
};
export type UpdateInfo = {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  url?: string;
};
export type ErkinodeEvent = {
  type: string;
  chooseFolder?: boolean;
  sessionId?: string;
  status?: string;
  message?: string;
  details?: string;
  code?: string;
  data?: string;
  bytes?: number;
} & Partial<Transfer> &
  Partial<Prompt>;
declare global {
  interface Window {
    erkinode: {
      invoke<T = any>(method: string, args?: unknown): Promise<T>;
      onEvent(callback: (event: ErkinodeEvent) => void): () => void;
      ack(id: string, bytes: number): void;
    };
  }
}
