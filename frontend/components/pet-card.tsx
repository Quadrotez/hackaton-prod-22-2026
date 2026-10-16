import type { Pet } from "@/lib/pets";
import Image from "next/image";

function getAgeYears(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function formatAge(years: number): string {
  const mod10 = years % 10;
  const mod100 = years % 100;
  if (mod10 === 1 && mod100 !== 11) return `${years} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${years} года`;
  }
  return `${years} лет`;
}

export function PetCard({ pet }: { pet: Pet }) {
  const age =
    pet.birth_date != null ? formatAge(getAgeYears(pet.birth_date)) : null;

  return (
    <div className="flex flex-col gap-8 bg-white rounded-lg px-4 py-4 w-96">
      <div className="flex flex-row gap-4 items-center">
        {pet.photo_url && (
          <Image width={64} height={64} src={pet.photo_url} alt={pet.name} className="rounded-full bg-zinc-100 w-12 h-12 object-contain" />
        )}
        <div className="flex flex-col gap-2.5 justify-center">
          <h5 className="leading-4">{pet.name}</h5>
          <h6 className="text-muted-foreground">{pet.species} {pet.breed}, {formatAge(getAgeYears(pet.birth_date))}</h6>
        </div>
      </div>
      
    </div>
  );
}
