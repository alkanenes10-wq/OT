"use client";
// Tek giriş noktası: oturuma ve role göre doğru ekranı gösterir.

import { CounselorApp } from "./counselor";
import { isSupabaseConfigured, useAuth, useRoute } from "./db";
import { ConfigMissing, CounselorShell, LoginScreen, ProfileProblem, SetupScreen, StudentShell } from "./shell";
import { StudentApp } from "./student";
import { PageLoader } from "./ui";

export default function Home() {
  const { loading, session, profile, profileError } = useAuth();
  const { route } = useRoute();

  if (!isSupabaseConfigured) return <ConfigMissing />;
  if (loading) return <PageLoader />;
  if (!session) return route.v === "kurulum" ? <SetupScreen /> : <LoginScreen />;
  if (profileError) return <ProfileProblem message={profileError} />;
  if (!profile) return <PageLoader />;
  if (profile.role === "counselor") {
    return (
      <CounselorShell>
        <CounselorApp />
      </CounselorShell>
    );
  }
  return (
    <StudentShell>
      <StudentApp />
    </StudentShell>
  );
}
