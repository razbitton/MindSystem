import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/authenticated-shell";
import { getServerSession } from "@/lib/server-auth";

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <AuthenticatedShell user={session.user}>{children}</AuthenticatedShell>;
}
