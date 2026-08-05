import { AuthForm } from "@/components/auth/auth-form";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const { mode, error } = await searchParams;
  return (
    <AuthForm
      initialMode={mode === "signup" ? "signup" : "signin"}
      initialError={error}
    />
  );
}
