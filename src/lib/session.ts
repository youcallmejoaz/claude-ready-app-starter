import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Use at the top of every signed-in page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session.user;
}
