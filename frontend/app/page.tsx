import { LoginForm } from "@/components/login-form";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col md:flex-row h-screen">
      <h2 className="absolute top-6 left-6 z-10">PetCare</h2>
      <div className="flex md:w-1/2 bg-secondary relative px-6">
        <Image src="/cat.png" alt="Cat" width={400} height={400} className="absolute top-2/5 left-2/3 transform -translate-x-1/2 -translate-y-1/2" />
        <h1 className="bottom-1/3 absolute">Заботьтесь<br />о здоровье вашего питомца</h1>
      </div>
      <div className="flex flex-1 items-center justify-center bg-primary p-6 md:w-1/2">
        <LoginForm />
      </div>
    </div>
  );
}