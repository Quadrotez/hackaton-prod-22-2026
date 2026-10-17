import { LoginForm } from "@/components/login-form";
import Image from "next/image";
import { Logo } from "@/components/logo";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col md:flex-row">
      <Logo className="absolute left-6 top-6 z-10" />
      <section className="flex flex-col items-center gap-6 bg-secondary px-6 pb-8 pt-20 md:w-1/2 md:justify-between md:p-12">
        <Image
          src="/cat.png"
          alt="Cat"
          width={400}
          height={400}
          priority
          sizes="(min-width: 768px) 400px, 60vw"
          className="h-auto w-3/5 max-w-[400px] md:w-full md:self-end"
        />
        <h1 className="text-balance text-center md:self-start md:text-left">Заботьтесь<br />о здоровье вашего питомца</h1>
      </section>
      <section className="flex flex-1 items-center justify-center bg-secondary md:bg-primary px-6 py-10 md:w-1/2">
        <LoginForm />
      </section>
    </main>
  );
}