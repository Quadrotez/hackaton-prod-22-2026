import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Единый стиль карточек: формы, плитки, элементы списков
const cardVariants = cva("rounded-2xl border p-5", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      accent: "border-transparent bg-primary text-primary-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
}

export { Card, cardVariants }
