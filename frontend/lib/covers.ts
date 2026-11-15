/** Cover photo shown behind the overview header of a commune (INSEE code → image URL). */
export const CITY_COVERS: Record<string, string> = {
  // Marseille
  "13055":
    "https://images.unsplash.com/photo-1566838217578-1903568a76d9?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D",
};

/** Background of the cover: the photo fading into the page colour (#F7F9FB) from 59 % of its height. */
export const coverBackground = (url: string) =>
  `linear-gradient(180deg, rgba(247, 249, 251, 0) 0%, #F7F9FB 59.16%), url("${url}") lightgray 50% / cover no-repeat`;
