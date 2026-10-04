import Link from "next/link"
import type { VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

/** A Next.js link styled as a button. Keeps link semantics (no role="button"), unlike `<Button render={<Link />}>`. */
function ButtonLink({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { ButtonLink }
