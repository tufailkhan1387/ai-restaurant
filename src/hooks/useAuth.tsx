import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type AppRole = "super_admin" | "admin" | "manager" | "agent" | "driver";
type AgentStatus = "available" | "on_call" | "busy" | "offline" | "break";

/** Minimal user object from the standalone API (replaces Supabase Auth User). */
export type AppUser = { id: string; email?: string };

export type AppSession = { access_token: string; user: AppUser };

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_extension: string | null;
  status: AgentStatus | null;
  created_at: string;
  updated_at: string;
  roles?: string[];
  restaurantIds?: string[];
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: AgentStatus) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isManagement: boolean;
  isDriver: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
    return data as Profile;
  };

  const fetchRole = async (userId: string): Promise<AppRole | null> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching role:", error);
      return null;
    }
    return data?.role as AppRole;
  };

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(async () => {
            const [profileData, roleData] = await Promise.all([
              fetchProfile(currentSession.user.id),
              fetchRole(currentSession.user.id),
            ]);
            // Force status to "available" so the UI can present the user as online
            if (profileData && profileData.status !== "available") {
              await supabase
                .from("profiles")
                .update({ status: "available" })
                .eq("id", currentSession.user.id);
              profileData.status = "available";
            }
            setProfile(profileData);
            setRole(roleData);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!existingSession) {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error.message,
      });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        redirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: error.message,
      });
      throw error;
    }
    toast({
      title: "Account created",
      description: "Please check your email to verify your account.",
    });
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: error.message,
      });
      throw error;
    }
  };

  const updateStatus = async (status: AgentStatus) => {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("id", user.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Status update failed",
        description: (error as any).message || "Unknown error",
      });
      throw error;
    }

    setProfile((prev) => (prev ? { ...prev, status } : null));
    toast({
      title: "Status updated",
      description: `You are now ${status.replace("_", " ")}`,
    });
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    const profileData = await fetchProfile(user.id);
    if (profileData) {
      setProfile(profileData);
    }
  };

  const isManagement = role === "super_admin" || role === "admin" || role === "manager";
  const isDriver = role === "driver";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        signIn,
        signUp,
        signOut,
        updateStatus,
        refreshProfile,
        isManagement,
        isDriver,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
