/** Product brand — keep UI copy in sync with these constants. */

export const PRODUCT_NAME = "AI Restaurant";
export const PRODUCT_BYLINE = "by Qubetech";
export const PRODUCT_COMPANY = "Qubetech";
export const PRODUCT_EMAIL = "join@ringtable.io";
export const PRODUCT_TAGLINE = "Never miss a restaurant order again.";
export const PRODUCT_DESCRIPTION =
  "AI Restaurant answers every call, takes pickup orders, books tables, and sends phone, QR, website and staff orders straight to your kitchen — in one order inbox.";

export const BRAND_ASSETS = {
  /** Orange utensils app mark */
  appIcon: "/brand/app-icon.png",
  appIconSvg: "/brand/app-icon.svg",
} as const;

export function productTitle(suffix?: string) {
  if (suffix) return `${PRODUCT_NAME} — ${suffix} | ${PRODUCT_COMPANY}`;
  return `${PRODUCT_NAME} | ${PRODUCT_COMPANY}`;
}
