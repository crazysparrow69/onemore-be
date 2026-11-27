export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthRequest = {
  user?: AuthUser;
  header(name: string): string | undefined;
};
