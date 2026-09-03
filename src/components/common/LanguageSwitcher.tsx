import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { changeAppLanguage } from "@/i18n";
import { SUPPORTED_LANGUAGES, getActiveLanguage } from "@/i18n/formatters";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  showLabel?: boolean;
  variant?: "outline" | "ghost" | "secondary" | "default";
  size?: "sm" | "default" | "lg" | "icon";
}

export function LanguageSwitcher({
  className,
  showLabel = true,
  variant = "ghost",
  size = "default",
}: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang = getActiveLanguage();
  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  const handleToggle = () => {
    const nextLang = currentLang === "fr" ? "en" : "fr";
    changeAppLanguage(nextLang);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleToggle}
      className={cn(
        "flex items-center gap-2 h-10 rounded-lg border border-border/80 bg-card/80 px-3 text-sm font-medium hover:bg-muted/80 shadow-sm transition-all cursor-pointer select-none active:scale-95",
        className
      )}
      title={`Current: ${currentLangObj.name}. Click to switch to ${currentLang === "fr" ? "English" : "Français"}`}
      aria-label="Toggle Language"
    >
      <Globe className="h-4 w-4 text-primary shrink-0" />
      {showLabel && (
        <span className="font-semibold text-foreground text-xs sm:text-sm">
          {currentLangObj.name}
        </span>
      )}
    </Button>
  );
}
