"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { clientAuth, clientDb, firebaseConfigured } from "@/lib/firebase/client";
import { isStaffRole, type Role, type UserProfile } from "@/lib/types";

interface AuthState {
  /** Firebase user, null when signed out, undefined while loading. */
  user: User | null | undefined;
  /** Role from the ID token custom claims — the only client-side source of truth. */
  role: Role | null;
  /** Firestore profile doc (display metadata only, never used for gating). */
  profile: UserProfile | null;
  isStaff: boolean;
  configured: boolean;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: undefined,
  role: null,
  profile: null,
  isStaff: false,
  configured: false,
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = firebaseConfigured();
  const [user, setUser] = useState<User | null | undefined>(
    configured ? undefined : null
  );
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!configured) return;
    const auth = clientAuth();
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setProfile(null);
        return;
      }
      try {
        const token = await u.getIdTokenResult();
        const claimRole = token.claims.role;
        setRole(
          claimRole === "prefect" ||
            claimRole === "vice-head" ||
            claimRole === "head" ||
            claimRole === "teacher"
            ? claimRole
            : null
        );
      } catch {
        setRole(null);
      }
      try {
        const snap = await getDoc(doc(clientDb(), "users", u.uid));
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      } catch {
        setProfile(null);
      }
    });
  }, [configured]);

  const signOutUser = useCallback(async () => {
    if (configured) await signOut(clientAuth());
  }, [configured]);

  const value = useMemo(
    () => ({
      user,
      role,
      profile,
      isStaff: isStaffRole(role),
      configured,
      signOutUser,
    }),
    [user, role, profile, configured, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
