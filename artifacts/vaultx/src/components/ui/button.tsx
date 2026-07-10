import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary/50 shadow-[0_0_20px_rgba(52,211,153,0.15)] hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(52,211,153,0.3)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 border border-destructive/50",
        outline:
          "border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-secondary/50",
        ghost: "hover:bg-white/10 hover:text-white text-muted-foreground border border-transparent",
        link: "text-primary underline-offset-4 hover:underline border border-transparent",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
