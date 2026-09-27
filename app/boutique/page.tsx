// The Boutique — a tab destination reachable from the Profile hub and from
// every picker's "Get this in the Boutique" link. Metadata shell only; the
// screen itself is BoutiqueContent (a Client Component that calls useT()).

import { routeMetadata } from "../lib/routeMetadata";
import { BoutiqueContent } from "./BoutiqueContent";

export const metadata = routeMetadata({
  title: "Boutique",
  description: "Buy cosmetics for Books & Runs — badges, avatar frames, titles, banners and more. Cosmetic only, never a gameplay edge.",
  path: "/boutique",
  index: false,
});

export default function BoutiquePage() {
  return <BoutiqueContent />;
}
