// Demo accounts behind the login buttons. Seeded by backend/scripts/create_demo_user.py
// on every deploy; keep the emails in sync with DEMO_ACCOUNTS there.
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "demo";

export const demoAccounts = [
  {
    email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "demo@quadrotez.com",
    title: "Кошка Барсик",
  },
  {
    email: "family@quadrotez.com",
    title: "Семья с собакой",
  },
  {
    email: "pregnancy@quadrotez.com",
    title: "Беременность и передача",
  },
  {
    email: "senior@quadrotez.com",
    title: "Пожилой питомец",
  },
  {
    email: "hamster@quadrotez.com",
    title: "Хомяк и запасы",
  },
] as const;
