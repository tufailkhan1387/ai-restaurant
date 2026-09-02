import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const { t } = useTranslation(["auth", "common"]);
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-extrabold text-foreground">404</h1>
        <p className="text-xl font-semibold text-foreground">{t("auth:pageNotFound", "Page Not Found")}</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {t("auth:pageNotFoundDesc", "The page you are looking for does not exist or has been moved.")}
        </p>
        <div className="pt-2">
          <Link to="/" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90">
            {t("auth:returnToDashboard", "Return to Dashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

