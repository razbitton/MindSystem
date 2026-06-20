import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ className, imageClassName }: BrandLogoProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden", className)}
      aria-hidden
    >
      <img
        src="/brand/mindsystem-logo-dark.png"
        alt=""
        draggable={false}
        className={cn("block h-full w-full object-contain dark:hidden", imageClassName)}
      />
      <img
        src="/brand/mindsystem-logo-light.png"
        alt=""
        draggable={false}
        className={cn("hidden h-full w-full object-contain dark:block", imageClassName)}
      />
    </span>
  );
}
