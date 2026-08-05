import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;

  if (!token_hash || !type) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          Invalid reset link. Please request a new one.
        </p>
      </main>
    );
  }

  return <UpdatePasswordForm tokenHash={token_hash} type={type} />;
}
