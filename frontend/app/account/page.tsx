import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { AccountProfile } from "@/components/account-profile";

export const metadata: Metadata = {
  title: "Аккаунт — PetCare",
};

export default function AccountPage() {
  return (
    <PageShell>
      <AccountProfile />
    </PageShell>
  );
}
